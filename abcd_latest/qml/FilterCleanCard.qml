import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: card

    property string phase: "idle" // idle, purging, motor, closing
    property int purgeSec: 5
    property int closeSec: 10
    property string fcaOpenButtonColor: machineBridge.getCommandButtonColor(0x12)
    property string fcaCloseButtonColor: machineBridge.getCommandButtonColor(0x13)
    property string filterMotorButtonColor: machineBridge.getCommandButtonColor(0x14)

    color: root.bg
    Layout.fillWidth: true
    Layout.fillHeight: true
    Layout.minimumHeight: 185
    Layout.preferredHeight: 200

    Rectangle {
        anchors.fill: parent
        anchors.margins: 2
        color: card.phase === "idle" ? root.bgCard : root.bgCardHover
        border.color: root.borderHover
        border.width: 1

        Rectangle {
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            height: 3
            color: root.iconColor
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 8
            spacing: 4

            Item {
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: 44
                Layout.preferredHeight: 44
                Layout.minimumHeight: 44
                Layout.maximumHeight: 44

                Text {
                    anchors.centerIn: parent
                    text: "🧹"
                    font.pixelSize: 28
                    color: root.iconColor
                }
            }

            Text {
                text: "FILTER CLEAN"
                font.pixelSize: 12
                font.bold: true
                color: root.text
                Layout.alignment: Qt.AlignHCenter
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                maximumLineCount: 1
                Layout.minimumHeight: 22
                Layout.maximumHeight: 24
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 2
                Layout.minimumHeight: 22
                Layout.maximumHeight: 22

                Rectangle {
                    width: 12
                    height: 12
                    radius: 6
                    color: card.phase !== "idle" ? root.ledOn : root.ledOff
                    border.color: card.phase !== "idle" ? root.accentGreenBright : root.textDim
                    border.width: card.phase !== "idle" ? 2 : 1
                }

                Text {
                    id: statusText
                    text: card.phase === "idle" ? "OFF" : "ON"
                    font.family: "Consolas"
                    font.pixelSize: 10
                    font.bold: true
                    color: card.phase !== "idle" ? root.accentGreenBright : root.textDim
                }

                Item {
                    Layout.fillWidth: true
                }

                Text {
                    id: modeText
                    text: "IDLE"
                    font.pixelSize: 10
                    color: card.phase !== "idle" ? root.accentGreenBright : root.textDim
                }
            }

            Button {
                id: actionBtn

                text: {
                    if (card.phase === "idle") return "START"
                    if (card.phase === "purging") return "PURGING..."
                    if (card.phase === "motor") return "STOP"
                    if (card.phase === "closing") return "STOPPING..."
                    return "START"
                }

                enabled: card.phase !== "purging" && card.phase !== "closing"

                font.pixelSize: 11
                font.bold: true
                Layout.fillWidth: true
                Layout.preferredHeight: 36
                Layout.minimumHeight: 36
                Layout.maximumHeight: 36
                Layout.topMargin: 4

                background: Rectangle {
                    radius: 3
                    color: {
                        // Check if any button color is active
                        if (card.fcaOpenButtonColor === "blue" || card.fcaOpenButtonColor === "green" || card.fcaOpenButtonColor === "red") {
                            return card.fcaOpenButtonColor === "blue" ? "#007bff" : card.fcaOpenButtonColor === "green" ? "#00e676" : "#dc3545"
                        }
                        if (card.filterMotorButtonColor === "blue" || card.filterMotorButtonColor === "green" || card.filterMotorButtonColor === "red") {
                            return card.filterMotorButtonColor === "blue" ? "#007bff" : card.filterMotorButtonColor === "green" ? "#00e676" : "#dc3545"
                        }
                        if (card.fcaCloseButtonColor === "blue" || card.fcaCloseButtonColor === "green" || card.fcaCloseButtonColor === "red") {
                            return card.fcaCloseButtonColor === "blue" ? "#007bff" : card.fcaCloseButtonColor === "green" ? "#00e676" : "#dc3545"
                        }
                        
                        if (card.phase === "motor") {
                            return actionBtn.pressed ? root.accentGreenBright : root.accentGreen
                        }

                        if (card.phase === "closing" || card.phase === "purging") {
                            return root.btnBg
                        }

                        return actionBtn.pressed ? root.btnBgHover : root.btnBg
                    }
                }

                contentItem: Text {
                    text: parent.text
                    color: card.phase === "motor" ? root.bg : root.text
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                onClicked: {
                    if (card.phase === "idle") {
                        startPurge()
                    } else if (card.phase === "motor") {
                        userStopMotor()
                    }
                }
            }

            Item {
                Layout.fillHeight: true
            }

            Text {
                text: "PB3 5s → PB5 motor → PB4 close"
                font.pixelSize: 9
                color: root.textDim
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                maximumLineCount: 2
            }
        }
    }

    Timer {
        id: purgeTimer
        interval: 1000
        repeat: true

        onTriggered: {
            card.purgeSec = card.purgeSec - 1
            modeText.text = card.purgeSec + "s"

            if (card.purgeSec <= 0) {
                purgeTimer.stop()
                startMotor()
            }
        }
    }

    Timer {
        id: closeTimer
        interval: 1000
        repeat: true

        onTriggered: {
            card.closeSec = card.closeSec - 1
            modeText.text = card.closeSec + "s"

            if (card.closeSec <= 0) {
                finishClose()
            }
        }
    }

    function startPurge() {
        card.phase = "purging"
        card.purgeSec = 5

        statusText.text = "ON"
        modeText.text = card.purgeSec + "s"

        machineBridge.filterCleanPhasePurge()
        purgeTimer.start()
    }

    function startMotor() {
        card.phase = "motor"
        statusText.text = "ON"
        modeText.text = "MOTOR"

        machineBridge.filterCleanPhaseMotor()
    }

    function userStopMotor() {
        card.phase = "closing"
        card.closeSec = 10

        statusText.text = "CLOSE"
        modeText.text = card.closeSec + "s"

        machineBridge.filterCleanPhaseUserStopped()
        closeTimer.start()
    }

    function finishClose() {
        closeTimer.stop()
        purgeTimer.stop()

        card.phase = "idle"
        statusText.text = "OFF"
        modeText.text = "IDLE"

        machineBridge.filterCleanPhaseFinish()
    }
}