import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12
import QtQuick.Window 2.12
import "."

ApplicationWindow {
    id: root
    visible: true
    width: 1024
    height: 600
    title: "DYNACLEAN EV Sweeper HMI"
    color: "#050d14"
    visibility: Window.FullScreen

    property color bg: "#050d14"
    property color bgCard: "#0f1c28"
    property color bgCardHover: "#152536"
    property color bgCardActive: "#0d1a28"
    property color iconColor: "#00e5ff"
    property color iconHover: "#00b8d4"
    property color text: "#FFFFFF"
    property color textDim: "#78909c"
    property color border: "#1a3a52"
    property color borderHover: "#00b8d4"
    property color borderGlow: "#00e5ff"
    property color btnBg: "#263d52"
    property color btnBgHover: "#345066"
    property color btnActive: "#00c853"
    property color accentGreen: "#00e676"
    property color accentGreenBright: "#69f0ae"
    property color accentOrange: "#ff9500"
    property color accentOrangeDark: "#e67e22"
    property color ledOff: "#546e7a"
    property color ledOn: "#00e676"
    property color errorRed: "#e74c3c"

    readonly property var pageSources: ({
        "FollowUpPage": "FollowUpPage.qml",
        "SweeperControlsPage": "SweeperControlsPage.qml",
        "DumpingPage": "DumpingPage.qml",
        "ReportsPage": "ReportsPage.qml",
        "MachineInfoPage": "MachineInfoPage.qml",
        "Hmi32Monitor": "Hmi32Monitor.qml",
        "Main1SvgPage": "Main1SvgPage.qml"
    })

    Connections {
        target: appController

        onFullscreenChanged: {
            console.log("[DEBUG QML] onFullscreenChanged called!")
            if (appController.isFullscreen) {
                root.visibility = Window.FullScreen
            } else {
                root.visibility = Window.Windowed
                root.width = Math.max(400, Screen.width / 2)
                root.height = Math.max(300, Screen.height / 2)
                root.x = (Screen.width - root.width) / 2
                root.y = (Screen.height - root.height) / 2
            }
        }

        onLogoutPasswordRequested: {
            console.log("[DEBUG QML] onLogoutPasswordRequested called!")
            logoutDialog.visible = true
            logoutPasswordField.text = ""
            logoutPasswordField.focus = true
        }

        onErrorOccurred: function (message, severity) {
            addErrorPopup(message, severity)
        }

        onClearError: {
            errorPopups.clear()
        }
    }

    // Error Popups Management
    ListModel {
        id: errorPopups
    }

    Component {
        id: errorPopupComponent
        Rectangle {
            id: popup
            property string messageText: ""
            property string severityLevel: "error"
            property int itemIndex: 0

            width: Math.min(400, root.width - 40)
            height: Math.max(60, contentRow.height + 24)
            color: severityLevel === "error" ? "#e74c3c" : root.accentOrangeDark
            border.color: severityLevel === "error" ? "#c0392b" : root.accentOrange
            border.width: 2
            radius: 4
            z: 999
            opacity: 0
            visible: true

            // Position popups from right top
            x: root.width - width - 20
            y: 20 + itemIndex * (height + 12)

            RowLayout {
                id: contentRow
                anchors.fill: parent
                anchors.margins: 12
                spacing: 12

                Text {
                    id: iconText
                    text: severityLevel === "error" ? "!" : "⚠"
                    font.pixelSize: 24
                    font.bold: true
                    color: "white"
                    Layout.alignment: Qt.AlignVCenter
                }

                Text {
                    id: messageTextArea
                    text: popup.messageText
                    color: "white"
                    font.pixelSize: 14
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    verticalAlignment: Text.AlignVCenter
                }

                Button {
                    id: closeBtn
                    text: "✕"
                    font.pixelSize: 16
                    font.bold: true
                    Layout.preferredWidth: 36
                    Layout.preferredHeight: 36
                    background: Rectangle {
                        color: "transparent"
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: "white"
                        font: parent.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: {
                        errorPopups.remove(popup.itemIndex)
                    }
                }
            }

            // Auto-dismiss timer
            Timer {
                id: autoDismissTimer
                interval: severityLevel === "error" ? 8000 : 5000
                onTriggered: errorPopups.remove(popup.itemIndex)
            }

            // Enter animation
            Behavior on opacity {
                NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
            }
            Behavior on y {
                NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
            }

            Component.onCompleted: {
                opacity = 1
                autoDismissTimer.start()
            }
        }
    }

    Repeater {
        id: errorPopupRepeater
        model: errorPopups
        delegate: errorPopupComponent
    }

    function addErrorPopup(message, severity) {
        errorPopups.append({
            "messageText": message,
            "severityLevel": severity,
            "itemIndex": errorPopups.count
        })
        // Update indexes of all items
        for (var i = 0; i < errorPopups.count; i++) {
            errorPopups.setProperty(i, "itemIndex", i)
        }
    }

    Shortcut {
        sequence: StandardKey.Cancel
        onActivated: Qt.quit()
    }

    Rectangle {
        id: logoutDialog
        anchors.centerIn: parent
        width: 400
        height: 320
        color: root.bgCard
        border.color: root.borderHover
        border.width: 2
        radius: 4
        visible: false
        z: 1000

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 24
            spacing: 16

            Text {
                text: "ENTER PASSWORD"
                color: root.iconColor
                font.pixelSize: 18
                font.bold: true
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: "Same as Machine Info"
                color: root.textDim
                font.pixelSize: 12
                Layout.alignment: Qt.AlignHCenter
            }

            TextField {
                id: logoutPasswordField
                Layout.fillWidth: true
                Layout.preferredHeight: 48
                placeholderText: "Password"
                echoMode: TextInput.Password
                color: root.text
                placeholderTextColor: root.textDim

                background: Rectangle {
                    anchors.fill: parent
                    color: root.bg
                    border.color: root.border
                    border.width: 1
                }

                onAccepted: {
                    if (text)
                        appController.verifyLogoutPassword(text)
                }
            }

            Text {
                id: logoutErrorLabel
                text: ""
                color: root.errorRed
                font.pixelSize: 12
                Layout.alignment: Qt.AlignHCenter
            }

            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: 12

                Button {
                    text: "LOG OUT"
                    font.pixelSize: 12
                    font.bold: true
                    Layout.preferredWidth: 120
                    Layout.preferredHeight: 48
                    background: Rectangle { color: root.accentGreen }
                    contentItem: Text {
                        text: parent.text
                        color: root.bg
                        font: parent.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: appController.verifyLogoutPassword(logoutPasswordField.text)
                }

                Button {
                    text: "CANCEL"
                    font.pixelSize: 12
                    font.bold: true
                    Layout.preferredWidth: 120
                    Layout.preferredHeight: 48
                    background: Rectangle { color: root.btnBg }
                    contentItem: Text {
                        text: parent.text
                        color: root.text
                        font: parent.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: logoutDialog.visible = false
                }
            }
        }

 Connections {
    target: appController

    function onLogoutPasswordVerified(success) {
        console.log("[DEBUG QML] onLogoutPasswordVerified called! success =", success)

        if (success) {
            logoutDialog.visible = false
            logoutPasswordField.text = ""
            logoutErrorLabel.text = ""
        } else {
            logoutErrorLabel.text = "Incorrect password"
            logoutPasswordField.text = ""
            logoutPasswordField.focus = true
        }
    }
}
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        Sidebar {
            Layout.preferredWidth: 220
            Layout.fillHeight: true
            onPageRequested: appController.showPage(pageName)
        }

        Loader {
            id: pageLoader
            Layout.fillWidth: true
            Layout.fillHeight: true
            asynchronous: true
            active: true
            source: pageSources[appController.currentPage] || pageSources["FollowUpPage"]
        }
    }
}
