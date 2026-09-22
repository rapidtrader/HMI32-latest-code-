from PyQt5.QtCore import QObject, QTimer, pyqtSlot, pyqtSignal, Qt, QDateTime, QThread, QMetaObject, Q_ARG
from PyQt5.QtCore import QAbstractListModel, QModelIndex
import json
import os
from datetime import datetime

from app import machine_info_store as store
from app.config import SYNC_INTERVAL_MS, SOCKET_IO_STATE_EMIT_MS, can_require_response
from app.worker import run_background
from logic.machine_logic import (
    Machine,
    get_daily_runtimes,
    get_suction_runtime_hours,
    get_suction_runtime_seconds,
    get_suction_sessions,
    sync_suction_sessions_to_api,
    set_sweeping_forced_off_ui,
    set_litter_forced_off_ui,
    get_litter_state,
    get_sweeping_state,
    get_left_extend_state,
    get_left_retract_state,
    get_right_extend_state,
    get_right_retract_state,
    get_front_up_state,
    get_front_down_state,
    get_rear_up_state,
    get_rear_down_state,
    set_can_send_callback,
)   
from logic.machine_identity import read_or_create_machine_id
from hardware.can_sender import (
    get_current_distance,
    get_message_log,
    get_gpio_state,
    get_suction_adc,
    get_pa0_adc,
    get_a25_distance,
    get_a25_raw_data,
    get_a25_current_raw_data,
    get_a25_status,
    get_a25_debug_info,
    register_distance_callback,
    register_gpio_status_callback,
    register_send_success_callback,
    register_suction_adc_callback,
    register_pa0_adc_callback,
    register_a25_callback,
    COMMAND_NAMES,
)

try:
    from logic.socket_client import (
        emit_state as _sock_emit_state,
        emit_can_gpio as _sock_emit_can_gpio,
        emit_a25 as _sock_emit_a25,
    )
except Exception:
    _sock_emit_state = None
    _sock_emit_can_gpio = None
    _sock_emit_a25 = None

class NotificationHistory(QAbstractListModel):
    """Model to store and manage command error notifications with timestamps."""
    
    NOTIFICATION_FILE = "data/error_log.json"
    MAX_NOTIFICATIONS = 50
    
    def __init__(self):
        super().__init__()
        self.notifications = []
        self._load_from_file()
    
    def _load_from_file(self):
        """Load notifications from local file."""
        try:
            if os.path.exists(self.NOTIFICATION_FILE):
                with open(self.NOTIFICATION_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.notifications = data.get('notifications', [])
                    print(f"[DEBUG] Loaded {len(self.notifications)} notifications from file")
        except Exception as e:
            print(f"[ERROR] Failed to load notification history: {e}")
            self.notifications = []
    
    def _save_to_file(self):
        """Save notifications to local file."""
        try:
            os.makedirs("data", exist_ok=True)
            with open(self.NOTIFICATION_FILE, 'w', encoding='utf-8') as f:
                json.dump({"notifications": self.notifications}, f, indent=2)
                print(f"[DEBUG] Saved {len(self.notifications)} notifications to file")
        except Exception as e:
            print(f"[ERROR] Failed to save notification history: {e}")
    
    def add_notification(self, message: str, severity: str):
        """Add a new notification with timestamp."""
        timestamp = QDateTime.currentDateTime().toString("yyyy-MM-dd hh:mm:ss")
        self.beginInsertRows(QModelIndex(), 0, 0)
        notif = {
            "timestamp": timestamp,
            "message": message,
            "severity": severity
        }
        self.notifications.insert(0, notif)
        self.endInsertRows()
        
        # Keep max notifications and remove old ones
        if len(self.notifications) > self.MAX_NOTIFICATIONS:
            removed_count = len(self.notifications) - self.MAX_NOTIFICATIONS
            self.beginRemoveRows(QModelIndex(), self.MAX_NOTIFICATIONS, len(self.notifications) - 1)
            self.notifications = self.notifications[:self.MAX_NOTIFICATIONS]
            self.endRemoveRows()
            print(f"[DEBUG] Removed {removed_count} old notifications")
        
        # Save to file off the UI thread
        run_background("notification_save", self._save_to_file)
    
    def rowCount(self, parent=QModelIndex()):
        return len(self.notifications)
    
    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid() or index.row() >= len(self.notifications):
            return None
        
        notif = self.notifications[index.row()]
        if role == Qt.DisplayRole or role == Qt.UserRole:
            return notif
        return None
    
    def roleNames(self):
        return {
            Qt.DisplayRole: b"display",
            Qt.UserRole: b"notification",
        }
    
    def clear_notifications(self):
        """Clear all notifications."""
        if len(self.notifications) > 0:
            self.beginResetModel()
            self.notifications.clear()
            self.endResetModel()
            run_background("notification_save", self._save_to_file)
            print("[DEBUG] Cleared all notifications")


# Button state colors
COLOR_DEFAULT = "default"
COLOR_BLUE = "blue"
COLOR_GREEN = "green"
COLOR_RED = "red"


class MachineBridge(QObject):
    """Machine control + data for QML (machineBridge). Slots must live in class body for PyQt5."""

    sweepingForcedOff = pyqtSignal()
    litterForcedOff = pyqtSignal()
    litterStateChanged = pyqtSignal()
    sweepingStateChanged = pyqtSignal()
    leftExtendStateChanged = pyqtSignal()
    leftRetractStateChanged = pyqtSignal()
    rightExtendStateChanged = pyqtSignal()
    rightRetractStateChanged = pyqtSignal()
    frontUpStateChanged = pyqtSignal()
    frontDownStateChanged = pyqtSignal()
    rearUpStateChanged = pyqtSignal()
    rearDownStateChanged = pyqtSignal()
    distanceChanged = pyqtSignal()
    suctionAdcChanged = pyqtSignal(int) # # New signal for suction ADC updates
    pa0AdcChanged = pyqtSignal(int)  # PA0 water pressure ADC updates
    a25Changed = pyqtSignal()
    canMessageLogChanged = pyqtSignal()
    commandButtonColorChanged = pyqtSignal(int, str)  # cmd, color
    commandErrorOccurred = pyqtSignal(str, str)  # (message, severity: "error" / "warning")
    notificationHistoryChanged = pyqtSignal()  # Emitted when notification history updates
    machineInfoApiFinished = pyqtSignal(str, str)  # (operation: submit|update, result)

    # Internal thread-safe signals
    _httpStateSyncFinished = pyqtSignal()
    _gpioStatusReceivedOnMain = pyqtSignal(int, int)
    _suctionAdcReceivedOnMain = pyqtSignal(int)  # New internal signal
    _pa0AdcReceivedOnMain = pyqtSignal(int)  # PA0 internal signal

    def __init__(self):
        super().__init__()

        self.machine = Machine()
        self.notification_history = NotificationHistory()

        self._sync_timer = QTimer(self)
        self._sync_timer.timeout.connect(self._schedule_api_sync)
        self._sync_timer.start(SYNC_INTERVAL_MS)
        QTimer.singleShot(2000, self._schedule_api_sync)

        self._refresh_timer = QTimer(self)
        self._refresh_timer.timeout.connect(self._refresh_states)
        self._refresh_timer.start(250)

        self._http_sync_inflight = False
        self._http_sync_pending = False
        self._httpStateSyncFinished.connect(self._on_http_state_sync_finished)

        # Ensure these handlers run in the main Qt thread
        self._gpioStatusReceivedOnMain.connect(
            self.on_gpio_status_received,
            Qt.QueuedConnection,
        )
        self._suctionAdcReceivedOnMain.connect(
            self.on_suction_adc_received,
            Qt.QueuedConnection,
        )
        self._pa0AdcReceivedOnMain.connect(
            self.on_pa0_adc_received,
            Qt.QueuedConnection,
        )

        # Set up callbacks from machine_logic
        set_sweeping_forced_off_ui(lambda: self._emit_in_main_thread(self.sweepingForcedOff))
        set_litter_forced_off_ui(lambda: self._emit_in_main_thread(self.litterForcedOff))

        # Set up CAN callbacks
        register_distance_callback(self._on_distance_update)
        register_gpio_status_callback(self._on_gpio_status_update)
        register_send_success_callback(self._on_can_send_success_threadsafe)
        register_suction_adc_callback(self._on_suction_adc_update)
        register_pa0_adc_callback(self._on_pa0_adc_update)
        register_a25_callback(self._on_a25_update)

        # Button state tracking
        self._button_colors = {}
        self._pending_commands = {}
        self._timeout_timers = {}

        for cmd in COMMAND_NAMES:
            self._button_colors[cmd] = COLOR_DEFAULT
            self._pending_commands[cmd] = None
            self._timeout_timers[cmd] = None

        # Machine logic will call this when it wants to send CAN
        set_can_send_callback(self.send_can_command_with_ui_feedback)

        self._socket_state_timer = QTimer(self)
        self._socket_state_timer.timeout.connect(self._emit_socket_state_snapshot)
        self._socket_state_timer.start(SOCKET_IO_STATE_EMIT_MS)
        QTimer.singleShot(3000, self._emit_socket_state_snapshot)

    def _collect_current_states(self):
        return {
            "litter": get_litter_state(),
            "sweeping": get_sweeping_state(),
            "leftExtend": get_left_extend_state(),
            "leftRetract": get_left_retract_state(),
            "rightExtend": get_right_extend_state(),
            "rightRetract": get_right_retract_state(),
            "frontUp": get_front_up_state(),
            "frontDown": get_front_down_state(),
            "rearUp": get_rear_up_state(),
            "rearDown": get_rear_down_state(),
            "buttonColors": {f"0x{int(k):02X}": v for k, v in self._button_colors.items()},
        }

    def _collect_current_adc(self):
        try:
            suction = int(get_suction_adc() or 0)
        except Exception:
            suction = 0
        try:
            pa0 = int(get_pa0_adc() or 0)
        except Exception:
            pa0 = 0
        return {"suction": suction, "pa0": pa0}

    def _collect_current_distance(self):
        try:
            dist = int(get_current_distance() or 0)
        except Exception:
            dist = 0
        try:
            a25 = int(get_a25_distance() or 0)
        except Exception:
            a25 = 0
        try:
            a25_status = str(get_a25_status() or "")
        except Exception:
            a25_status = ""
        return {"cm": dist, "a25Cm": a25, "a25Status": a25_status}

    def _collect_current_runtime(self):
        return {
            "suctionSec": float(get_suction_runtime_seconds() or 0),
            "suctionHours": float(get_suction_runtime_hours() or 0),
            "daily": list(get_daily_runtimes() or []),
        }

    def _emit_socket_state_snapshot(self):
        states = self._collect_current_states()
        adc = self._collect_current_adc()
        distance = self._collect_current_distance()
        runtime = self._collect_current_runtime()

        if _sock_emit_state is not None:
            try:
                from logic.socket_client import is_connected
                if is_connected():
                    _sock_emit_state(
                        states=states,
                        adc=adc,
                        distance=distance,
                        runtime=runtime,
                    )
                    print("[DEBUG] State pushed to backend (socket)")
                    return
            except Exception as e:
                print(f"[DEBUG] socket state emit error: {e}")

        self._schedule_http_state_sync(states, adc, distance, runtime)

    def _schedule_http_state_sync(self, states, adc, distance, runtime):
        if self._http_sync_inflight:
            self._http_sync_pending = True
            return
        self._http_sync_inflight = True
        machine_id = read_or_create_machine_id()
        run_background(
            "http_state_sync",
            self._http_state_sync_worker,
            machine_id,
            states,
            adc,
            distance,
            runtime,
        )

    def _http_state_sync_worker(self, machine_id, states, adc, distance, runtime):
        try:
            from logic.backend_clinet import post_hmi32_state
            ok, code, body = post_hmi32_state(
                machine_id,
                states,
                adc=adc,
                distance=distance,
                runtime=runtime,
                timeout=8,
            )
            if ok:
                print("[DEBUG] HTTP state sync OK")
            else:
                print(f"[DEBUG] HTTP state sync failed: {code} {str(body)[:200]}")
        except Exception as e:
            print(f"[DEBUG] HTTP state sync error: {e}")
        finally:
            self._httpStateSyncFinished.emit()

    @pyqtSlot()
    def _on_http_state_sync_finished(self):
        self._http_sync_inflight = False
        if self._http_sync_pending:
            self._http_sync_pending = False
            self._emit_socket_state_snapshot()

    def set_button_color(self, cmd: int, color: str):
        """Set the color of a specific button."""
        if cmd in self._button_colors:
            old_color = self._button_colors[cmd]

            if old_color != color:
                print(f"[DEBUG] UI COLOR CHANGE cmd=0x{cmd:02X}: {old_color} -> {color}")
                self._button_colors[cmd] = color
                self.commandButtonColorChanged.emit(cmd, color)

    def _on_command_timeout(self, cmd: int):
        """Handle command timeout."""
        if cmd in self._pending_commands and self._pending_commands[cmd] is not None:
            cmd_name = COMMAND_NAMES.get(cmd, f"CMD 0x{cmd:02X}")
            print(f"[DEBUG] CAN reply timeout cmd=0x{cmd:02X} ({cmd_name}) -> RED")
            self.set_button_color(cmd, COLOR_RED)
            self._pending_commands[cmd] = None

            # Front brush commands - disable notifications for these
            front_brush_commands = [0x0E, 0x0F, 0x08, 0x09, 0x0A, 0x0B]

            # Add to history but don't show popup
            if cmd not in front_brush_commands:
                error_msg = f"{cmd_name}: CAN Network Down - No Response"
                self.notification_history.add_notification(error_msg, "error")
                self.notificationHistoryChanged.emit()

            if self._timeout_timers.get(cmd):
                self._timeout_timers[cmd].stop()
                self._timeout_timers[cmd] = None

    def send_can_command_with_ui_feedback(self, cmd: int, state: int):
        """
        Arm pending UI state before CAN is sent.
        Blocks when called from a worker thread so 0x202 replies are not missed.
        """
        if QThread.currentThread() == self.thread():
            self._arm_command_ui_feedback(cmd, state)
        else:
            QMetaObject.invokeMethod(
                self,
                "_arm_command_ui_feedback",
                Qt.BlockingQueuedConnection,
                Q_ARG(int, cmd),
                Q_ARG(int, state),
            )

    @pyqtSlot(int, int)
    def _arm_command_ui_feedback(self, cmd: int, state: int):
        """Mark command pending and start timeout. Runs only on main Qt thread."""

        if self._timeout_timers.get(cmd):
            self._timeout_timers[cmd].stop()
            self._timeout_timers[cmd] = None

        print(f"[DEBUG] Button clicked cmd=0x{cmd:02X} state={state} -> BLUE (pending armed)")
        self.set_button_color(cmd, COLOR_BLUE)
        self._pending_commands[cmd] = state

        # Timeout after 3 seconds
        timeout_timer = QTimer(self)
        timeout_timer.setSingleShot(True)
        timeout_timer.timeout.connect(lambda c=cmd: self._on_command_timeout(c))
        timeout_timer.start(3000)

        self._timeout_timers[cmd] = timeout_timer
        self._emit_socket_state_snapshot()

    def _on_can_send_success_threadsafe(self, cmd: int, state: int):
        if can_require_response():
            return
        QMetaObject.invokeMethod(
            self,
            "_on_can_send_success",
            Qt.QueuedConnection,
            Q_ARG(int, cmd),
            Q_ARG(int, state),
        )

    @pyqtSlot(int, int)
    def _on_can_send_success(self, cmd: int, state: int):
        """Optimistic UI: GREEN after bus send when 0x202 response is not required."""
        if self._pending_commands.get(cmd) is None:
            return
        cmd_name = COMMAND_NAMES.get(cmd, f"CMD 0x{cmd:02X}")
        if state == 1:
            print(f"[DEBUG] CAN sent cmd=0x{cmd:02X} ({cmd_name}) -> GREEN (no 0x202 wait)")
            self.set_button_color(cmd, COLOR_GREEN)
        else:
            print(f"[DEBUG] CAN sent cmd=0x{cmd:02X} ({cmd_name}) -> DEFAULT (no 0x202 wait)")
            self.set_button_color(cmd, COLOR_DEFAULT)
        self._pending_commands[cmd] = None
        if self._timeout_timers.get(cmd):
            self._timeout_timers[cmd].stop()
            self._timeout_timers[cmd] = None
        self._emit_socket_state_snapshot()

    def on_gpio_status_received(self, cmd: int, state: int):
        """Handle GPIO status received from STM32."""
        if _sock_emit_can_gpio is not None:
            try:
                _sock_emit_can_gpio(cmd, state)
            except Exception:
                pass

        # Define mutual exclusion groups
        group_litter_sweeping = [0x10, 0x11]
        group_up_down = [0x0C, 0x0D, 0x0E, 0x0F]
        group_extract_retract = [0x08, 0x09, 0x0A, 0x0B]
        
        # Front brush commands - disable wiring issue notifications for these
        front_brush_commands = [0x0E, 0x0F, 0x08, 0x09, 0x0A, 0x0B]

        if cmd in self._pending_commands and self._pending_commands[cmd] is not None:
            expected_state = self._pending_commands[cmd]
            cmd_name = COMMAND_NAMES.get(cmd, f"CMD 0x{cmd:02X}")

            if expected_state == state:
                if state == 1:
                    print(f"[DEBUG] CAN 0x202 received cmd=0x{cmd:02X} ({cmd_name}) state={state} -> GREEN")
                    self.set_button_color(cmd, COLOR_GREEN)
                else:
                    print(f"[DEBUG] CAN 0x202 received cmd=0x{cmd:02X} ({cmd_name}) state={state} -> DEFAULT")
                    self.set_button_color(cmd, COLOR_DEFAULT)
            else:
                print(
                    f"[DEBUG] CAN 0x202 received cmd=0x{cmd:02X} ({cmd_name}) "
                    f"state={state} expected={expected_state} -> RED"
                )
                self.set_button_color(cmd, COLOR_RED)
                
                # Add to history but don't show popup
                if cmd not in front_brush_commands:
                    error_msg = f"{cmd_name}: Board/Wiring Issue - Wrong Response"
                    self.notification_history.add_notification(error_msg, "error")
                    self.notificationHistoryChanged.emit()

            self._pending_commands[cmd] = None

            if self._timeout_timers.get(cmd):
                self._timeout_timers[cmd].stop()
                self._timeout_timers[cmd] = None

        else:
            # Check if this status update is for a command in a mutual exclusion group
            is_in_exclusion_group = False
            if cmd in group_litter_sweeping:
                is_in_exclusion_group = True
            elif cmd in group_up_down:
                is_in_exclusion_group = True
            elif cmd in group_extract_retract:
                is_in_exclusion_group = True

            if is_in_exclusion_group:
                # This is an automatic status update for a mutually exclusive command
                if state == 0:
                    print(f"[DEBUG] CAN 0x202 received auto-off cmd=0x{cmd:02X} -> DEFAULT")
                    self.set_button_color(cmd, COLOR_DEFAULT)
                else:
                    print(f"[DEBUG] CAN 0x202 received auto-on cmd=0x{cmd:02X} -> GREEN")
                    self.set_button_color(cmd, COLOR_GREEN)
            else:
                # Periodic status received, but no command is pending.
                print(f"[DEBUG] Periodic status ignored for UI color: cmd=0x{cmd:02X}, state={state}")

        self._emit_socket_state_snapshot()

    @pyqtSlot(int, result=str)
    def getCommandButtonColor(self, cmd: int):
        """Get the color of a specific command button for QML."""
        return self._button_colors.get(cmd, COLOR_DEFAULT)

    def _emit_in_main_thread(self, signal):
        """Emit a signal safely from any thread."""
        QTimer.singleShot(0, signal.emit)

    def _on_distance_update(self, distance_cm):
        """Called when a new distance reading is received from STM32."""
        print(f"[DEBUG] MachineBridge: Distance update received: {distance_cm} cm")
        self._emit_in_main_thread(self.distanceChanged)

    def _on_gpio_status_update(self, cmd, state):
        """Called when a new GPIO status is received from STM32."""
        print(f"[DEBUG] MachineBridge: GPIO update received: cmd={cmd:02X}, state={state}")

        QTimer.singleShot(0, self.canMessageLogChanged.emit)
        self._gpioStatusReceivedOnMain.emit(cmd, state)

    def _on_suction_adc_update(self, adc_value):
        """Called when a new suction analog value is received from STM32."""
        print(f"[DEBUG] MachineBridge: Suction ADC update received: {adc_value}")
        QTimer.singleShot(0, self.canMessageLogChanged.emit)
        self._suctionAdcReceivedOnMain.emit(adc_value)

    def _on_pa0_adc_update(self, adc_value):
        """Called when a new PA0 analog value is received from STM32."""
        print(f"[DEBUG] MachineBridge: PA0 ADC update received: {adc_value}")
        QTimer.singleShot(0, self.canMessageLogChanged.emit)
        self._pa0AdcReceivedOnMain.emit(int(adc_value))

    def _on_a25_update(self, distance, raw_data, status):
        """Called when a new A25 sensor reading is received."""
        print(f"[DEBUG] MachineBridge: A25 update received: distance={distance}, status={status}")
        if _sock_emit_a25 is not None:
            try:
                _sock_emit_a25(distance, raw_data, status)
            except Exception:
                pass
        QTimer.singleShot(0, self.canMessageLogChanged.emit)
        self._emit_in_main_thread(self.a25Changed)

    def on_suction_adc_received(self, adc_value):
        """Handle suction ADC update on main thread."""
        print(f"[DEBUG] MachineBridge (main thread): Suction ADC={adc_value}")
        self.suctionAdcChanged.emit(adc_value)

    def on_pa0_adc_received(self, adc_value):
        """Handle PA0 ADC update on main thread."""
        print(f"[DEBUG] MachineBridge (main thread): PA0 ADC={adc_value}")
        self.pa0AdcChanged.emit(int(adc_value))

    @pyqtSlot(result=int)
    def getPa0Adc(self):
        value = int(get_pa0_adc())
        print(f"[DEBUG] MachineBridge.getPa0Adc() = {value}")
        return value

    def _refresh_states(self):
        self.litterStateChanged.emit()
        self.sweepingStateChanged.emit()
        self.leftExtendStateChanged.emit()
        self.leftRetractStateChanged.emit()
        self.rightExtendStateChanged.emit()
        self.rightRetractStateChanged.emit()
        self.frontUpStateChanged.emit()
        self.frontDownStateChanged.emit()
        self.rearUpStateChanged.emit()
        self.rearDownStateChanged.emit()

    @pyqtSlot(int, result=bool)
    def getGpioState(self, cmd):
        """Get the state of a specific GPIO command from HMI32."""
        return get_gpio_state(cmd) == 1

    def _run(self, label: str, fn):
        run_background(label, fn)

    def _machine(self, attr: str):
        self._run(attr, getattr(self.machine, attr))

    def _schedule_api_sync(self):
        run_background("machine_config_sync", store.sync_from_api)

    @pyqtSlot(result=int)
    def getCurrentDistance(self):
        return get_current_distance()

    @pyqtSlot(result=int)
    def getSuctionAdc(self):
        return get_suction_adc()

    @pyqtSlot(result="QVariantList")
    def getCanMessageLog(self):
        return get_message_log()

    # ----- Litter picker -----
    @pyqtSlot()
    def litterPickerOn(self):
        self._machine("litter_picker_on")
        self._emit_in_main_thread(self.litterStateChanged)
        self._emit_in_main_thread(self.sweepingStateChanged)

    @pyqtSlot()
    def litterPickerOff(self):
        self._machine("litter_picker_off")
        self._emit_in_main_thread(self.litterStateChanged)

    @pyqtSlot(result=bool)
    def getLitterState(self):
        return get_litter_state()

    # ----- Auto sweeping -----
    @pyqtSlot()
    def autoSweepingOn(self):
        self._machine("auto_sweeping_on")
        self._emit_in_main_thread(self.sweepingStateChanged)
        self._emit_in_main_thread(self.litterStateChanged)

    @pyqtSlot()
    def autoSweepingOff(self):
        self._machine("auto_sweeping_off")
        self._emit_in_main_thread(self.sweepingStateChanged)

    @pyqtSlot(result=bool)
    def getSweepingState(self):
        return get_sweeping_state()

    @pyqtSlot(result=bool)
    def getLeftExtendState(self):
        return get_left_extend_state()

    @pyqtSlot(result=bool)
    def getLeftRetractState(self):
        return get_left_retract_state()

    @pyqtSlot(result=bool)
    def getRightExtendState(self):
        return get_right_extend_state()

    @pyqtSlot(result=bool)
    def getRightRetractState(self):
        return get_right_retract_state()

    @pyqtSlot(result=bool)
    def getFrontUpState(self):
        return get_front_up_state()

    @pyqtSlot(result=bool)
    def getFrontDownState(self):
        return get_front_down_state()

    @pyqtSlot(result=bool)
    def getRearUpState(self):
        return get_rear_up_state()

    @pyqtSlot(result=bool)
    def getRearDownState(self):
        return get_rear_down_state()

    # ----- Suction -----
    @pyqtSlot()
    def suctionOn(self):
        self._machine("suction_on")

    @pyqtSlot(float)
    def suctionSetPower(self, volts):
        self._run("suction_set_power", lambda: self.machine.suction_set_power(volts))

    @pyqtSlot(int)
    def setSuctionSpeed(self, percent):
        print(f"[DEBUG] MachineBridge.setSuctionSpeed({percent})")
        self.machine.suction_set_speed(int(percent))

    @pyqtSlot()
    def suctionOff(self):
        self._machine("suction_off")

    # ----- Jet -----
    @pyqtSlot()
    def jetOn(self):
        self._machine("jet_on")

    @pyqtSlot()
    def jetOff(self):
        self._machine("jet_off")

    # ----- Spray -----
    @pyqtSlot()
    def sprayOn(self):
        self._machine("spray_on")

    @pyqtSlot()
    def sprayOff(self):
        self._machine("spray_off")

    # ----- Vacuum -----
    @pyqtSlot()
    def vacuumOn(self):
        self._machine("vacuum_on")

    @pyqtSlot()
    def vacuumOff(self):
        self._machine("vacuum_off")

    # ----- Filter clean -----
    @pyqtSlot()
    def filterCleanPhasePurge(self):
        self._machine("filter_clean_phase_purge")

    @pyqtSlot()
    def filterCleanPhaseMotor(self):
        self._machine("filter_clean_phase_motor")

    @pyqtSlot()
    def filterCleanPhaseUserStopped(self):
        self._machine("filter_clean_phase_user_stopped")

    @pyqtSlot()
    def filterCleanPhaseFinish(self):
        self._machine("filter_clean_phase_finish")

    @pyqtSlot()
    def filterCleanOff(self):
        self._machine("filter_clean_off")

    # ----- Dump -----
    @pyqtSlot()
    def dumpUpOn(self):
        self._machine("dump_up_on")

    @pyqtSlot()
    def dumpUpOff(self):
        self._machine("dump_up_off")

    @pyqtSlot()
    def dumpDownOn(self):
        self._machine("dump_down_on")

    @pyqtSlot()
    def dumpDownOff(self):
        self._machine("dump_down_off")

    @pyqtSlot()
    def dumpLeftOn(self):
        self._machine("dump_left_on")

    @pyqtSlot()
    def dumpLeftOff(self):
        self._machine("dump_left_off")

    # ----- Gate -----
    @pyqtSlot()
    def gateOpenOn(self):
        self._machine("gate_open_on")

    @pyqtSlot()
    def gateOpenOff(self):
        self._machine("gate_open_off")

    @pyqtSlot()
    def gateCloseOn(self):
        self._machine("gate_close_on")

    @pyqtSlot()
    def gateCloseOff(self):
        self._machine("gate_close_off")

    # ----- Front brush -----
    @pyqtSlot()
    def brushDown(self):
        self._machine("brush_down")

    @pyqtSlot()
    def brushUp(self):
        self._machine("brush_up")

    @pyqtSlot()
    def brushDownOff(self):
        self._machine("brush_down_off")

    @pyqtSlot()
    def brushUpOff(self):
        self._machine("brush_up_off")

    # ----- Rear brush -----
    @pyqtSlot()
    def rearBrushDown(self):
        self._machine("rear_brush_down")

    @pyqtSlot()
    def rearBrushUp(self):
        self._machine("rear_brush_up")

    @pyqtSlot()
    def rearBrushDownOff(self):
        self._machine("rear_brush_down_off")

    @pyqtSlot()
    def rearBrushUpOff(self):
        self._machine("rear_brush_up_off")

    # ----- Left brush -----
    @pyqtSlot()
    def brushLeftLeftOn(self):
        self._machine("brush_left_left_on")

    @pyqtSlot()
    def brushLeftLeftOff(self):
        self._machine("brush_left_left_off")

    @pyqtSlot()
    def brushLeftRightOn(self):
        self._machine("brush_left_right_on")

    @pyqtSlot()
    def brushLeftRightOff(self):
        self._machine("brush_left_right_off")

    # ----- Right brush -----
    @pyqtSlot()
    def brushRightLeftOn(self):
        print("MachineBridge.brushRightLeftOn() CALLED!")
        self._machine("brush_right_left_on")

    @pyqtSlot()
    def brushRightLeftOff(self):
        print("MachineBridge.brushRightLeftOff() CALLED!")
        self._machine("brush_right_left_off")

    @pyqtSlot()
    def brushRightRightOn(self):
        self._machine("brush_right_right_on")

    @pyqtSlot()
    def brushRightRightOff(self):
        self._machine("brush_right_right_off")

    # ----- Reports / runtime -----
    @pyqtSlot(result=float)
    def getSuctionRuntimeHours(self):
        return get_suction_runtime_hours()

    @pyqtSlot(result=float)
    def getSuctionRuntimeSeconds(self):
        return get_suction_runtime_seconds()

    @pyqtSlot(result="QVariantList")
    def getDailyRuntimes(self):
        return get_daily_runtimes()

    @pyqtSlot(result="QVariantList")
    def getSuctionSessions(self):
        return get_suction_sessions()

    @pyqtSlot()
    def syncSuctionSessionsToApi(self):
        self._run("sync_suction_sessions", sync_suction_sessions_to_api)

    # ----- Machine info -----
    @pyqtSlot(result="QVariantMap")
    def loadMachineInfo(self):
        return store.load_local()

    @pyqtSlot(result=str)
    def getMachineId(self):
        return read_or_create_machine_id()

    @pyqtSlot(result=bool)
    def hasMachinePasswordSet(self):
        return store.has_password()

    @pyqtSlot(str, result=bool)
    def verifyMachinePassword(self, entered):
        return store.verify_password(entered)

    @pyqtSlot("QVariantMap")
    def saveMachineInfo(self, data):
        store.save_local(dict(data))

    @pyqtSlot(str, str, str, str, str, result=str)
    def submitMachineInfo(self, machine_id, client_name, location, plate, password):
        run_background(
            "submit_machine_info",
            self._submit_machine_info_worker,
            machine_id,
            client_name,
            location,
            plate,
            password,
        )
        return "pending"

    @pyqtSlot(str, str, str, str, str, result=str)
    def updateMachineInfo(self, machine_id, client_name, location, plate, password):
        run_background(
            "update_machine_info",
            self._update_machine_info_worker,
            machine_id,
            client_name,
            location,
            plate,
            password,
        )
        return "pending"

    def _submit_machine_info_worker(
        self, machine_id, client_name, location, plate, password
    ):
        result = store.submit_to_api(
            machine_id, client_name, location, plate, password
        )
        self.machineInfoApiFinished.emit("submit", result)

    def _update_machine_info_worker(
        self, machine_id, client_name, location, plate, password
    ):
        result = store.update_on_api(
            machine_id, client_name, location, plate, password
        )
        self.machineInfoApiFinished.emit("update", result)

    @pyqtSlot(result=int)
    def getA25Distance(self):
        return get_a25_distance()

    @pyqtSlot(result="QVariantList")
    def getA25RawData(self):
        return get_a25_raw_data()

    @pyqtSlot(result=str)
    def getA25Status(self):
        return get_a25_status()

    @pyqtSlot(result=str)
    def getA25DebugInfo(self):
        return get_a25_debug_info()

    @pyqtSlot(result="QVariantList")
    def getA25CurrentRawData(self):
        return get_a25_current_raw_data()

    # ----- Notification History -----
    @pyqtSlot(result="QVariant")
    def getNotificationHistoryModel(self):
        """Return the notification history model for QML."""
        return self.notification_history
    
    @pyqtSlot()
    def clearNotificationHistory(self):
        """Clear all notifications from history."""
        self.notification_history.clear_notifications()
        self.notificationHistoryChanged.emit()