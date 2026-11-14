@echo off
setlocal
REM Flash real project .hex — NOT ST-LINK_GDB_server*.srec
REM Edit HEX below to your CubeIDE build output, then run this .bat as Administrator if needed.

set "CLI=C:\ST\STM32CubeIDE_2.1.1\STM32CubeIDE\plugins\com.st.stm32cube.ide.mcu.externaltools.cubeprogrammer.win32_2.2.400.202601091506\tools\bin\STM32_Programmer_CLI.exe"

REM CAN_PROJECT_3 — build in CubeIDE first (Debug). .hex optional; .elf works.
set "HEX=C:\ashutosh\CAN_PROJECT_3\CAN_PROJECT_3\Debug\CAN_PROJECT_3.elf"

if not exist "%CLI%" (
  echo ERROR: STM32_Programmer_CLI not found at:
  echo   %CLI%
  echo Install STM32CubeIDE or fix path in this script.
  exit /b 1
)

if not exist "%HEX%" (
  echo ERROR: HEX not found:
  echo   %HEX%
  echo Build your CubeIDE project first, then set HEX= to Debug\*.hex
  exit /b 1
)

for %%A in ("%HEX%") do set HEXSIZE=%%~zA
if %HEXSIZE% LSS 10000 (
  echo ERROR: file too small — wrong image?
  exit /b 1
)
if %HEXSIZE% LSS 20000 (
  echo NOTE: CAN_PROJECT_3 .elf flash payload is ~15 KB — OK if map has CAN_Send_GPIO_Status.
)

echo Connecting ST-LINK and full chip erase...
"%CLI%" -c port=SWD mode=UR -e all
if errorlevel 1 (
  echo Erase/connect failed. Close CubeIDE debug, try Under Reset in CubeProgrammer GUI.
  exit /b 1
)

echo Programming %HEX% (no -v verify — avoids false mismatch while CPU runs)...
"%CLI%" -c port=SWD mode=UR -d "%HEX%" -hardRst
if errorlevel 1 (
  echo Program failed.
  exit /b 1
)

echo OK — firmware programmed. Reset board and test CAN on Pi.
endlocal
exit /b 0