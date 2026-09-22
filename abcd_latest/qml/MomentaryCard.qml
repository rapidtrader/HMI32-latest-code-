import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: card
    property string icon
    property string title
    property string imageNormal
    property string imagePressed
    property string description
    property bool pressed: false
    property bool state: false // New: real HMI32 state!
    property int cmd: 0
    property string buttonColor: "default"
    
    // Debouncing properties
    property bool acceptEvents: true
    
    signal pressedDown()
    signal released()

    color: root.bg
    Layout.fillWidth: true
    Layout.fillHeight: true
    Layout.minimumHeight: 320  // Add minimum height to match StatusCard
    Layout.preferredHeight: 320

    // Debounce timer
    Timer {
        id: eventDebounceTimer
        interval: 150 // 150ms debounce
        onTriggered: card.acceptEvents = true
    }

    Rectangle {
        anchors.fill: parent
        anchors.margins: 2
        color: (card.state || card.pressed) ? root.bgCardHover : root.bgCard
        border.color: root.borderHover

        Rectangle {
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            height: 4
            color: root.iconColor
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 14
            spacing: 8

            Text {
                text: card.icon
                font.pixelSize: 40
                color: root.iconColor
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: card.title
                font.pixelSize: 16
                font.bold: true
                color: root.text
                Layout.alignment: Qt.AlignHCenter
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 8

                Rectangle {
                    width: 16
                    height: 16
                    radius: 8
                    color: (card.state || card.pressed) ? root.ledOn : root.ledOff
                    border.color: (card.state || card.pressed) ? root.accentGreenBright : root.textDim
                    border.width: (card.state || card.pressed) ? 2 : 1
                }

                Text {
                    text: (card.state || card.pressed) ? "ACTIVE" : "IDLE"
                    font.family: "Consolas"
                    font.pixelSize: 12
                    font.bold: true
                    color: (card.state || card.pressed) ? root.accentGreenBright : root.textDim
                }

                Item { Layout.fillWidth: true }

                Text {
                    text: (card.state || card.pressed) ? "RUNNING" : "HOLD TO ACTIVATE"
                    font.pixelSize: 11
                    color: (card.state || card.pressed) ? root.accentGreenBright : root.textDim
                }
            }

            Button {
                id: actionBtn
                text: "HOLD"
                font.pixelSize: 13
                font.bold: true
                Layout.fillWidth: true
                Layout.preferredHeight: 50
                Layout.topMargin: 8

                background: Rectangle {
                    color: {
                        if (card.buttonColor === "blue") {
                            return "#007bff"
                        } else if (card.buttonColor === "green") {
                            return root.accentGreen
                        } else if (card.buttonColor === "red") {
                            return "#dc3545"
                        } else {
                            return (card.state || actionBtn.pressed) ? (actionBtn.pressed ? root.accentOrangeDark : root.accentOrange) : root.accentOrange
                        }
                    }
                }

                contentItem: Text {
                    text: parent.text
                    color: (card.state) ? "#FFFFFF" : root.text // White when ON!
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                MouseArea {
                    anchors.fill: parent
                    onPressedChanged: {
                        if (pressed) {
                            if (!card.acceptEvents) {
                                return
                            }
                            card.acceptEvents = false
                            eventDebounceTimer.start()
                            
                            card.pressed = true
                            card.pressedDown()
                        } else {
                            card.pressed = false
                            card.released()
                        }
                    }
                }
            }

            Text {
                text: card.description
                font.pixelSize: 10
                color: root.textDim
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignLeft
                wrapMode: Text.WordWrap
                visible: card.description.length > 0
            }
        }
    }
}
