================================================================================
 WHY YOU SEE: ST-LINK_GDB_server*.srec  Size 14.52 KB  +  failed to erase memory
================================================================================

That 14 KB file is NOT your app. ST-LINK GDB server creates it for debug attach.
If CubeIDE flashes ONLY that file, your real firmware (main.c CAN image) never runs.

Fix: flash Debug\YourProject.hex (50–200 KB) with STM32CubeProgrammer OR Build+Run
     — never program anything named ST-LINK_GDB_server*.srec


================================================================================
 STEP A — STOP THE WRONG FLASH (CubeIDE)
================================================================================

1) Close all debug sessions (red Terminate / Disconnect all).

2) Project → Clean… → Clean all projects → Build Project.
   - Problems tab MUST be 0 errors.
   - If build fails, GDB may still push the 14 KB stub — fix compile errors first.

3) Confirm real hex exists:
   - In Project Explorer: expand Debug (or Release)
   - You must see YourProject.elf and YourProject.hex
   - Right-click .hex → Properties → size >> 20 KB

4) Prefer flashing WITHOUT Debug first:
   - Run → Run (Ctrl+F11) — NOT Debug (F11) — if your launch is misconfigured
   OR use STEP B (standalone Programmer) — most reliable.

5) Debug launch fix (if you need F11):
   - Run → Debug Configurations… → your project → Debugger
   - Ensure "Program" / download uses the project ELF, not an external .srec
   - STM32Cube → untick dubious "Download during debug" if it targets wrong file
   - Apply → Close


================================================================================
 STEP B — FLASH WITH STANDALONE STM32CubeProgrammer (recommended)
================================================================================

1) Open "STM32CubeProgrammer" (desktop app), NOT via GDB server log window.

2) Right panel: ST-LINK, Connect mode = Under reset → Connect
   - Voltage ~3.3 V, Device F405/F407 family OK

3) If erase ever failed before:
   - Erasing & Programming → Full chip erase (or OB → RDP = Level 0, then mass erase)
   - Disconnect → Connect again

4) Erasing & Programming tab:
   - Browse → your file:  ...\YourProject\Debug\YourProject.hex
   - NOT from Temp\ST-LINK_GDB_server*.srec
   - Start Programming
   - Log must show Size >> 14 KB and "Download verified successfully"

5) Press hardware RESET on board → test on Pi (STEP D)


================================================================================
 STEP C — COMMAND LINE (same as your CubeIDE plugin path)
================================================================================

Edit program_flash_cli.bat → set HEX= to your Debug\*.hex path, run from cmd.

Or manually (adjust HEX path):

  set CLI=C:\ST\STM32CubeIDE_2.1.1\STM32CubeIDE\plugins\com.st.stm32cube.ide.mcu.externaltools.cubeprogrammer.win32_2.2.400.202601091506\tools\bin\STM32_Programmer_CLI.exe

  "%CLI%" -c port=SWD mode=UR -e all
  "%CLI%" -c port=SWD mode=UR -d "C:\path\to\YourProject\Debug\YourProject.hex" -v -hardRst


================================================================================
 STEP D — AFTER GOOD FLASH (Pi)
================================================================================

  pkill -f main_pyqt5.py || true
  sh ~/hmi/abcd_latest_111/reset_can.sh
  timeout 15 candump -t a can0

Expect: 0x202 with 55 AA at boot, then 0x201 / 0x202 / 0x205 traffic.

  candump -t a can0 & sleep 0.5; cansend can0 200#3100; sleep 2; kill %1

Expect: line with 0x202 and data 31 00 or 31 01 (not only your 0x200 echo).


================================================================================
 ERASE FAIL — extra checks
================================================================================

- Only one tool on ST-LINK (close CubeIDE debug + Programmer + other GDB)
- Option bytes: RDP Level 0 (AA); disable sector write protection on sector 0
- Try Normal connect, then Under reset; lower SWD freq 800 kHz in Programmer
- ST-LINK firmware update (STLINK firmware upgrade in Programmer)
- Power: stable 3.3 V, short USB cable, board reset

================================================================================
 YOUR CUBE PROJECT
================================================================================

Path:  C:\ashutosh\CAN_PROJECT_3\CAN_PROJECT_3
Main:  Core\Src\main.c  (full CAN + F_IN already ~1200 lines)
Image: Debug\CAN_PROJECT_3.elf  (rebuild after code changes)

Flash from project folder:  double-click flash_firmware.bat
Or from HMI repo:             main_qml\program_flash_cli.bat  (same .elf path)

CubeIDE Debug should use Debug/CAN_PROJECT_3.elf — NOT Temp ST-LINK_GDB_server*.srec