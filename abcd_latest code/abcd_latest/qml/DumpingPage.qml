import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: page
    color: root.bg

    // GPIO states from HMI32 (command numbers from can_sender.py)
    property bool gateOpenState: machineBridge.getGpioState(0x06)
    property bool gateCloseState: machineBridge.getGpioState(0x07)
    property bool dumpUpState: machineBridge.getGpioState(0x04)
    property bool dumpDownState: machineBridge.getGpioState(0x05)
    
    // Button colors
    property string gateOpenButtonColor: machineBridge.getCommandButtonColor(0x06)
    property string gateCloseButtonColor: machineBridge.getCommandButtonColor(0x07)
    property string dumpUpButtonColor: machineBridge.getCommandButtonColor(0x04)
    property string dumpDownButtonColor: machineBridge.getCommandButtonColor(0x05)
    
    Connections {
        target: machineBridge
        
        onCanMessageLogChanged: {
            // Refresh all GPIO states when any new status arrives
            page.gateOpenState = machineBridge.getGpioState(0x06)
            page.gateCloseState = machineBridge.getGpioState(0x07)
            page.dumpUpState = machineBridge.getGpioState(0x04)
            page.dumpDownState = machineBridge.getGpioState(0x05)
        }
        
        onCommandButtonColorChanged: {
            var cmd = arguments[0]
            var color = arguments[1]
            console.log("DumpingPage QML color signal received cmd:", cmd, "color:", color)
            if (cmd === 0x06) page.gateOpenButtonColor = color
            else if (cmd === 0x07) page.gateCloseButtonColor = color
            else if (cmd === 0x04) page.dumpUpButtonColor = color
            else if (cmd === 0x05) page.dumpDownButtonColor = color
        }
    }
    
    Component.onCompleted: {
        page.gateOpenState = machineBridge.getGpioState(0x06)
        page.gateCloseState = machineBridge.getGpioState(0x07)
        page.dumpUpState = machineBridge.getGpioState(0x04)
        page.dumpDownState = machineBridge.getGpioState(0x05)
        page.gateOpenButtonColor = machineBridge.getCommandButtonColor(0x06)
        page.gateCloseButtonColor = machineBridge.getCommandButtonColor(0x07)
        page.dumpUpButtonColor = machineBridge.getCommandButtonColor(0x04)
        page.dumpDownButtonColor = machineBridge.getCommandButtonColor(0x05)
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10  // Match other pages
        spacing: 10        // Match other pages

        // Header
        Column {
            Layout.alignment: Qt.AlignHCenter
            spacing: 5

            Text {
                text: "DUMPING CONTROLS"
                color: root.iconColor
                font.pixelSize: 24  // Match other pages
                font.bold: true
                horizontalAlignment: Text.AlignHCenter
            }

            Rectangle {
                width: 180  // Match other pages
                height: 3
                color: root.iconColor
                anchors.horizontalCenter: parent.horizontalCenter
            }
        }

        // Panel
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: 350  // Add minimum height
            color: root.bgCard
            border.color: root.borderHover
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 10  // Match other pages
                spacing: 8        // Match other pages

                Text {
                    text: "DUMP PANEL"
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

                // Cards row
                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumHeight: 120  // Add minimum height
                    spacing: 10  // Match other pages

                    ColumnLayout {
                        spacing: 8
                        Layout.fillWidth: true
                        Layout.fillHeight: true

                        MomentaryCard {
                            icon: "◀"
                            title: "GATE OPEN"
                            state: page.gateOpenState
                            cmd: 0x06
                            buttonColor: page.gateOpenButtonColor
                            onPressedDown: {
                                machineBridge.gateOpenOn()
                            }
                            onReleased: {
                                machineBridge.gateOpenOff()
                            }
                        }

                        MomentaryCard {
                            icon: "▶"
                            title: "GATE CLOSE"
                            state: page.gateCloseState
                            cmd: 0x07
                            buttonColor: page.gateCloseButtonColor
                            onPressedDown: {
                                machineBridge.gateCloseOn()
                            }
                            onReleased: {
                                machineBridge.gateCloseOff()
                            }
                        }
                    }

                    ColumnLayout {
                        spacing: 8
                        Layout.fillWidth: true
                        Layout.fillHeight: true

                        MomentaryCard {
                            icon: "↑"
                            title: "DUMP UP"
                            state: page.dumpUpState
                            cmd: 0x04
                            buttonColor: page.dumpUpButtonColor
                            onPressedDown: {
                                machineBridge.dumpUpOn()
                            }
                            onReleased: {
                                machineBridge.dumpUpOff()
                            }
                        }

                        MomentaryCard {
                            icon: "↓"
                            title: "DUMP DOWN"
                            state: page.dumpDownState
                            cmd: 0x05
                            buttonColor: page.dumpDownButtonColor
                            onPressedDown: {
                                machineBridge.dumpDownOn()
                            }
                            onReleased: {
                                machineBridge.dumpDownOff()
                            }
                        }
                    }
                }
            }
        }

        // Back button
        Item {
            Layout.preferredHeight: 60  // Match other pages
            Layout.fillWidth: true

            Button {
                anchors.centerIn: parent
                width: 200  // Match other pages
                height: 45  // Match other pages
                text: "← BACK TO MAIN"
                font.pixelSize: 12  // Match other pages
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
}
