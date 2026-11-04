import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: card

    property string icon: ""
    property string title: ""
    property string imageOff: ""
    property string imageOn: ""
    property string description: ""

    property bool state: false
    property int cmd: 0
    property string buttonColor: "default"

    // Debounce property to prevent rapid clicks
    property bool acceptClicks: true
    // Guard: only emit turnedOn/turnedOff on user action
    property bool userAction: false

    readonly property bool isOn: state

    signal turnedOn()
    signal turnedOff()

    property color bg: "#050d14"
    property color bgCard: "#0f1c28"
    property color bgCardHover: "#152536"
    property color iconColor: "#00e5ff"
    property color text: "#FFFFFF"
    property color textDim: "#78909c"
    property color borderHover: "#00b8d4"
    property color btnBg: "#263d52"
    property color btnBgHover: "#345066"
    property color accentGreen: "#00e676"
    property color accentGreenBright: "#69f0ae"
    property color ledOff: "#546e7a"
    property color ledOn: "#00e676"

    color: bg
    Layout.fillWidth: true
    Layout.fillHeight: true
    Layout.minimumHeight: 320
    Layout.preferredHeight: 320

    // Debounce timer
    Timer {
        id: clickDebounceTimer
        interval: 150 // 150ms debounce
        onTriggered: card.acceptClicks = true
    }

    Rectangle {
        anchors.fill: parent
        anchors.margins: 2
        color: card.isOn ? bgCardHover : bgCard
        border.color: borderHover

        Rectangle {
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            height: 4
            color: iconColor
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 14
            spacing: 8

            Item {
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: 68
                Layout.preferredHeight: 68
                Layout.minimumHeight: 68
                Layout.maximumHeight: 68

                Image {
                    anchors.centerIn: parent
                    asynchronous: true
                    cache: true
                    smooth: true
                    mipmap: true

                    source: {
                        if (card.isOn && card.imageOn !== "")
                            return appController.assetsPath + "/" + card.imageOn
                        if (card.imageOff !== "")
                            return appController.assetsPath + "/" + card.imageOff
                        return ""
                    }

                    sourceSize.width: 64
                    sourceSize.height: 64
                    fillMode: Image.PreserveAspectFit
                    visible: card.imageOff !== "" || card.imageOn !== ""
                }

                Text {
                    anchors.centerIn: parent
                    text: card.icon
                    font.pixelSize: 40
                    color: iconColor
                    visible: card.imageOff === "" && card.imageOn === ""
                }
            }

            Text {
                text: card.title
                font.pixelSize: 14
                font.bold: true
                color: text
                Layout.alignment: Qt.AlignHCenter
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                maximumLineCount: 2
                Layout.minimumHeight: 40
                Layout.maximumHeight: 40
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 8
                Layout.minimumHeight: 25
                Layout.maximumHeight: 25

                Rectangle {
                    width: 16
                    height: 16
                    radius: 8
                    color: card.isOn ? ledOn : ledOff
                    border.color: card.isOn ? accentGreenBright : textDim
                    border.width: card.isOn ? 2 : 1
                }

                Text {
                    text: card.isOn ? "ON" : "OFF"
                    font.family: "Consolas"
                    font.pixelSize: 11
                    font.bold: true
                    color: card.isOn ? accentGreenBright : textDim
                }

                Item { Layout.fillWidth: true }

                Text {
                    text: card.isOn ? "RUNNING" : "IDLE"
                    font.pixelSize: 11
                    color: card.isOn ? accentGreenBright : textDim
                }
            }

            Button {
                id: actionBtn
                text: card.isOn ? "TURN OFF" : "TURN ON"
                font.pixelSize: 13
                font.bold: true
                Layout.fillWidth: true
                Layout.preferredHeight: 50
                Layout.minimumHeight: 50
                Layout.maximumHeight: 50
                Layout.topMargin: 8

                background: Rectangle {
                    color: {
                        if (card.buttonColor === "blue") {
                            return "#007bff"
                        } else if (card.buttonColor === "green") {
                            return accentGreen
                        } else if (card.buttonColor === "red") {
                            return "#dc3545"
                        } else {
                            return card.isOn
                                   ? (actionBtn.pressed ? accentGreenBright : accentGreen)
                                   : (actionBtn.pressed ? btnBgHover : btnBg)
                        }
                    }
                }

                contentItem: Text {
                    text: parent.text
                    color: "#FFFFFF" // Always white as requested!
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                onClicked: {
            if (!card.acceptClicks) {
                return
            }
            card.acceptClicks = false
            clickDebounceTimer.start()

            console.log("StatusCard user click:", card.title, "current state:", card.isOn)
            card.userAction = true
            if (card.isOn) {
                card.turnedOff()
            } else {
                card.turnedOn()
            }
            card.userAction = false
        }
            }

            Item {
                Layout.fillHeight: true
            }

            Text {
                text: card.description
                font.pixelSize: 10
                color: textDim
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignLeft
                wrapMode: Text.WordWrap
                visible: card.description.length > 0
            }
        }
    }
}