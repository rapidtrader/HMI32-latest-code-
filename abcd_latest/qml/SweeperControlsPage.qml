import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: page
    color: root.bg

    property bool litterState: machineBridge.getLitterState()
    property bool sweepingState: machineBridge.getSweepingState()
    property bool jetState: machineBridge.getGpioState(0x02)
    property bool sprayState: machineBridge.getGpioState(0x03)
    property bool suctionState: machineBridge.getGpioState(0x01)
    
    property string litterButtonColor: machineBridge.getCommandButtonColor(0x10)
    property string sweepingButtonColor: machineBridge.getCommandButtonColor(0x11)
    property string jetButtonColor: machineBridge.getCommandButtonColor(0x02)
    property string sprayButtonColor: machineBridge.getCommandButtonColor(0x03)
    property string suctionButtonColor: machineBridge.getCommandButtonColor(0x01)
    property string fcaOpenButtonColor: machineBridge.getCommandButtonColor(0x12)
    property string fcaCloseButtonColor: machineBridge.getCommandButtonColor(0x13)
    property string filterMotorButtonColor: machineBridge.getCommandButtonColor(0x14)
    
    Connections {
        target: machineBridge
        
        onSweepingForcedOff: {
            page.sweepingState = machineBridge.getSweepingState()
        }
        
        onLitterForcedOff: {
            page.litterState = machineBridge.getLitterState()
        }
        
        onLitterStateChanged: {
            page.litterState = machineBridge.getLitterState()
        }
        
        onSweepingStateChanged: {
            page.sweepingState = machineBridge.getSweepingState()
        }
        
        onCommandButtonColorChanged: {
            var cmd = arguments[0]
            var color = arguments[1]
            console.log("SweeperControlsPage QML color signal received cmd:", cmd, "color:", color)
            if (cmd === 0x10) page.litterButtonColor = color
            else if (cmd === 0x11) page.sweepingButtonColor = color
            else if (cmd === 0x02) {
                page.jetButtonColor = color
                page.jetState = machineBridge.getGpioState(0x02)
            }
            else if (cmd === 0x03) {
                page.sprayButtonColor = color
                page.sprayState = machineBridge.getGpioState(0x03)
            }
            else if (cmd === 0x01) {
                page.suctionButtonColor = color
                page.suctionState = machineBridge.getGpioState(0x01)
            }
            else if (cmd === 0x12) page.fcaOpenButtonColor = color
            else if (cmd === 0x13) page.fcaCloseButtonColor = color
            else if (cmd === 0x14) page.filterMotorButtonColor = color
        }
    }
    
    Component.onCompleted: {
        page.litterState = machineBridge.getLitterState()
        page.sweepingState = machineBridge.getSweepingState()
        page.jetState = machineBridge.getGpioState(0x02)
        page.sprayState = machineBridge.getGpioState(0x03)
        page.suctionState = machineBridge.getGpioState(0x01)
        page.litterButtonColor = machineBridge.getCommandButtonColor(0x10)
        page.sweepingButtonColor = machineBridge.getCommandButtonColor(0x11)
        page.jetButtonColor = machineBridge.getCommandButtonColor(0x02)
        page.sprayButtonColor = machineBridge.getCommandButtonColor(0x03)
        page.suctionButtonColor = machineBridge.getCommandButtonColor(0x01)
        page.fcaOpenButtonColor = machineBridge.getCommandButtonColor(0x12)
        page.fcaCloseButtonColor = machineBridge.getCommandButtonColor(0x13)
        page.filterMotorButtonColor = machineBridge.getCommandButtonColor(0x14)
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 10

        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Column {
                Layout.alignment: Qt.AlignVCenter
                Layout.fillWidth: true
                spacing: 5

                Text {
                    text: "SWEEPER BRUSH CONTROL"
                    color: root.iconColor
                    font.pixelSize: 24
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                }

                Rectangle {
                    width: 180
                    height: 3
                    color: root.iconColor
                    anchors.horizontalCenter: parent.horizontalCenter
                }
            }

            Button {
                Layout.preferredWidth: 50
                Layout.preferredHeight: 50
                Layout.alignment: Qt.AlignTop | Qt.AlignRight
                background: Rectangle {
                    color: parent.pressed ? root.bgCardHover : root.btnBg
                    border.color: root.borderHover
                    border.width: 2
                    radius: 4
                }
                contentItem: Text {
                    text: "📋"
                    font.pixelSize: 28
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                onClicked: notificationModal.visible = true
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: 350
            color: root.bgCard
            border.color: root.borderHover
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 10
                spacing: 8

                Text {
                    text: "BRUSH PANEL"
                    color: root.textDim
                    font.family: "Consolas"
                    font.pixelSize: 11
                    font.bold: true
                    Layout.fillWidth: true
                }

                Rectangle {
                    height: 1
                    color: root.borderHover
                    Layout.fillWidth: true
                }

                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumHeight: 120
                    spacing: 10

                    StatusCard {
                        icon: "⬇"
                        title: "LITTER PICKER"
                        imageOff: "22.png"
                        imageOn: "23.png"
                        state: page.litterState
                        cmd: 0x10
                        buttonColor: page.litterButtonColor
                        onTurnedOn: machineBridge.litterPickerOn()
                        onTurnedOff: machineBridge.litterPickerOff()
                    }

                    StatusCard {
                        icon: "💨"
                        title: "ZET PRESSURE WASH"
                        imageOff: "16.png"
                        imageOn: "17.png"
                        state: page.jetState
                        cmd: 0x02
                        buttonColor: page.jetButtonColor
                        onTurnedOn: machineBridge.jetOn()
                        onTurnedOff: machineBridge.jetOff()
                    }

                    StatusCard {
                        icon: "🌀"
                        title: "VACUUM SYSTEM"
                        imageOff: "vaccum.png"
                        imageOn: "vaccum.png"
                        state: page.suctionState
                        cmd: 0x01
                        buttonColor: page.suctionButtonColor
                        onTurnedOn: machineBridge.suctionOn()
                        onTurnedOff: machineBridge.suctionOff()
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumHeight: 120
                    spacing: 10
                    Layout.topMargin: 4
                    Layout.bottomMargin: 8

                    StatusCard {
                        icon: "⬇"
                        title: "SWEEPING"
                        imageOff: "3.png"
                        imageOn: "4.png"
                        state: page.sweepingState
                        cmd: 0x11
                        buttonColor: page.sweepingButtonColor
                        onTurnedOn: machineBridge.autoSweepingOn()
                        onTurnedOff: machineBridge.autoSweepingOff()
                    }

                    StatusCard {
                        icon: "💧"
                        title: "WATER SPRAY"
                        imageOff: "1.png"
                        imageOn: "2.png"
                        state: page.sprayState
                        cmd: 0x03
                        buttonColor: page.sprayButtonColor
                        onTurnedOn: machineBridge.sprayOn()
                        onTurnedOff: machineBridge.sprayOff()
                    }

                    FilterCleanCard {
                        fcaOpenButtonColor: page.fcaOpenButtonColor
                        fcaCloseButtonColor: page.fcaCloseButtonColor
                        filterMotorButtonColor: page.filterMotorButtonColor
                    }
                }
            }
        }

        Item {
            Layout.preferredHeight: 60
            Layout.fillWidth: true

            Button {
                anchors.centerIn: parent
                width: 200
                height: 45
                text: "←  BACK TO MAIN"
                font.pixelSize: 12
                font.bold: true

                background: Rectangle {
                    color: parent.pressed ? root.bgCardHover : root.bg
                    border.color: root.borderHover
                    border.width: 2
                    radius: 4
                }

                contentItem: Text {
                    text: parent.text
                    color: root.iconColor
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                onClicked: appController.showPage("FollowUpPage")
            }
        }
    }

    Rectangle {
        id: notificationModal
        anchors.centerIn: parent
        width: Math.min(600, root.width - 40)
        height: Math.min(500, root.height - 40)
        color: root.bgCard
        border.color: root.borderHover
        border.width: 2
        radius: 4
        visible: false
        z: 1000

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 16
            spacing: 12

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Text {
                    text: "ERROR LOG"
                    color: root.iconColor
                    font.pixelSize: 18
                    font.bold: true
                    Layout.fillWidth: true
                }

                Button {
                    text: "X"
                    font.pixelSize: 14
                    font.bold: true
                    Layout.preferredWidth: 36
                    Layout.preferredHeight: 36
                    background: Rectangle {
                        color: "transparent"
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: root.text
                        font: parent.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: notificationModal.visible = false
                }
            }

            Rectangle {
                height: 1
                color: root.border
                Layout.fillWidth: true
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                color: root.bg
                border.color: root.border
                border.width: 1
                radius: 2

                ListView {
                    id: notificationList
                    anchors.fill: parent
                    anchors.margins: 8
                    model: machineBridge.getNotificationHistoryModel()
                    spacing: 4
                    clip: true

                    delegate: Rectangle {
                        width: parent.width - 16
                        height: 60
                        color: "#1a1a1a"
                        border.color: {
                            var n = model.display
                            if (n && typeof n === 'object' && n.severity === "error") return "#c0392b"
                            return "#ff9500"
                        }
                        border.width: 1
                        radius: 2

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 4

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 8

                                Text {
                                    text: {
                                        var n = model.display
                                        if (n && typeof n === 'object' && n.severity === "error") return "X"
                                        return "!"
                                    }
                                    color: {
                                        var n = model.display
                                        if (n && typeof n === 'object' && n.severity === "error") return root.errorRed
                                        return root.accentOrange
                                    }
                                    font.pixelSize: 14
                                    font.bold: true
                                }

                                Text {
                                    text: {
                                        var n = model.display
                                        return (n && typeof n === 'object') ? n.timestamp : ""
                                    }
                                    color: root.textDim
                                    font.pixelSize: 10
                                    Layout.fillWidth: true
                                }
                            }

                            Text {
                                text: {
                                    var n = model.display
                                    return (n && typeof n === 'object') ? n.message : ""
                                }
                                color: root.text
                                font.pixelSize: 11
                                Layout.fillWidth: true
                                wrapMode: Text.WordWrap
                            }
                        }
                    }

                    ScrollBar.vertical: ScrollBar {
                        policy: ScrollBar.AsNeeded
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Button {
                    text: "CLEAR ALL"
                    font.pixelSize: 11
                    font.bold: true
                    Layout.preferredHeight: 40
                    Layout.fillWidth: true
                    background: Rectangle {
                        color: parent.pressed ? root.bgCardHover : root.btnBg
                        border.color: root.borderHover
                        border.width: 1
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: root.text
                        font: parent.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: machineBridge.clearNotificationHistory()
                }

                Button {
                    text: "CLOSE"
                    font.pixelSize: 11
                    font.bold: true
                    Layout.preferredHeight: 40
                    Layout.preferredWidth: 100
                    background: Rectangle {
                        color: parent.pressed ? root.bgCardHover : root.accentGreen
                        border.color: root.borderGlow
                        border.width: 1
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: root.bg
                        font: parent.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: notificationModal.visible = false
                }
            }
        }
    }
}
