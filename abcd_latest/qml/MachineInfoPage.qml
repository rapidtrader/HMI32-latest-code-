import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: page
    color: root.bg

    property bool unlocked: false
    property string machineId: machineBridge.getMachineId()
    property string clientName: ""
    property string location: ""
    property string vehiclePlateNo: ""
    property string password: ""
    property string confirmPassword: ""
    property string status: ""
    property color statusColor: root.textDim
    property bool isPageVisible: appController.currentPage === "MachineInfoPage"

    property bool updateFromDuplicateSubmit: false

    Component.onCompleted: loadData()

    Connections {
        target: machineBridge
        function onMachineInfoApiFinished(operation, result) {
            if (operation === "submit") {
                handleSubmitResult(result)
            } else if (operation === "update") {
                handleUpdateResult(result)
            }
        }
    }

    onIsPageVisibleChanged: {
        if (isPageVisible) {
            loadData()
            // Re-check password gate when page becomes visible
            if (machineBridge.hasMachinePasswordSet() && !unlocked) {
                passwordOverlay.visible = true
            }
        }
    }

    function loadData() {
        var data = machineBridge.loadMachineInfo()
        if (data) {
            machineId = data.machineId || data.machine_id || machineBridge.getMachineId()
            clientName = data.clientName || data.client_name || ""
            location = data.location || ""
            vehiclePlateNo = data.vehiclePlateNo || data.vehicle_plate_no || ""
            password = data.password || ""
            confirmPassword = data.confirmPassword || data.password || ""
        }
    }

    // Password Overlay
    Rectangle {
        id: passwordOverlay
        anchors.fill: parent
        color: "#0a0a0f"
        visible: machineBridge.hasMachinePasswordSet() && !unlocked
        z: 100

        onVisibleChanged: {
            if (visible) {
                passwordInput.text = ""
                passwordInput.focus = true
                passwordError.text = ""
            }
        }

        Rectangle {
            id: passwordPopup
            anchors.centerIn: parent
            width: 400
            color: root.bgCard
            border.color: root.borderHover
            border.width: 2

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 32
                spacing: 16

                Text {
                    text: "ENTER PASSWORD"
                    color: root.iconColor
                    font.pixelSize: 18
                    font.bold: true
                    Layout.alignment: Qt.AlignHCenter
                }

                TextField {
                    id: passwordInput
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
                    onAccepted: verifyPassword()
                }

                Text {
                    id: passwordError
                    text: ""
                    color: root.errorRed
                    font.pixelSize: 12
                    Layout.alignment: Qt.AlignHCenter
                }

                Button {
                    text: "UNLOCK"
                    Layout.alignment: Qt.AlignHCenter
                    Layout.preferredWidth: 140
                    Layout.preferredHeight: 56
                    font.pixelSize: 12
                    font.bold: true
                    background: Rectangle {
                        color: root.accentGreen
                    }
                    contentItem: Text {
                        text: parent.text
                        color: root.bg
                        font: parent.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: verifyPassword()
                }
            }
        }
    }

    function verifyPassword() {
        if (machineBridge.verifyMachinePassword(passwordInput.text)) {
            unlocked = true
            passwordOverlay.visible = false
            passwordError.text = ""
            loadData()
        } else {
            passwordError.text = "Incorrect password"
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 20

        // Header
        Column {
            Layout.alignment: Qt.AlignHCenter
            spacing: 8

            Text {
                text: "MACHINE INFO"
                color: root.iconColor
                font.pixelSize: 28
                font.bold: true
                horizontalAlignment: Text.AlignHCenter
            }

            Rectangle {
                width: 180
                height: 3
                color: root.iconColor
                anchors.horizontalCenter: parent.horizontalCenter
            }

            Text {
                text: "Machine ID is set automatically for this device. Enter other details below."
                color: root.textDim
                font.pixelSize: 14
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                Layout.preferredWidth: 560
            }
        }

        // Main Panel
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: root.bgCard
            border.color: root.borderHover
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 24
                spacing: 20

                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 40

                    // Column 1
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 14

                        // Machine ID Field
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 80

                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 6

                                Text {
                                    text: "Machine ID (auto)"
                                    color: root.textDim
                                    font.pixelSize: 11
                                }

                                TextField {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 48
                                    text: page.machineId
                                    enabled: false
                                    color: root.text
                                    placeholderTextColor: root.textDim
                                    background: Rectangle {
                                        anchors.fill: parent
                                        color: root.bg
                                        border.color: root.border
                                        border.width: 1
                                    }
                                }
                            }
                        }

                        // Client Name Field
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 80

                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 6

                                Text {
                                    text: "Client Name"
                                    color: root.textDim
                                    font.pixelSize: 11
                                }

                                TextField {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 48
                                    text: page.clientName
                                    color: root.text
                                    placeholderTextColor: root.textDim
                                    background: Rectangle {
                                        anchors.fill: parent
                                        color: root.bg
                                        border.color: root.border
                                        border.width: 1
                                    }
                                    onTextChanged: page.clientName = text
                                }
                            }
                        }

                        // Password Field
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 80

                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 6

                                Text {
                                    text: "Password"
                                    color: root.textDim
                                    font.pixelSize: 11
                                }

                                TextField {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 48
                                    text: page.password
                                    echoMode: TextInput.Password
                                    color: root.text
                                    placeholderTextColor: root.textDim
                                    background: Rectangle {
                                        anchors.fill: parent
                                        color: root.bg
                                        border.color: root.border
                                        border.width: 1
                                    }
                                    onTextChanged: page.password = text
                                }
                            }
                        }
                    }

                    // Column 2
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 14

                        // Location Field
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 80

                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 6

                                Text {
                                    text: "Location"
                                    color: root.textDim
                                    font.pixelSize: 11
                                }

                                TextField {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 48
                                    text: page.location
                                    color: root.text
                                    placeholderTextColor: root.textDim
                                    background: Rectangle {
                                        anchors.fill: parent
                                        color: root.bg
                                        border.color: root.border
                                        border.width: 1
                                    }
                                    onTextChanged: page.location = text
                                }
                            }
                        }

                        // Vehicle Plate Field
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 80

                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 6

                                Text {
                                    text: "Vehicle Plate No."
                                    color: root.textDim
                                    font.pixelSize: 11
                                }

                                TextField {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 48
                                    text: page.vehiclePlateNo
                                    color: root.text
                                    placeholderTextColor: root.textDim
                                    background: Rectangle {
                                        anchors.fill: parent
                                        color: root.bg
                                        border.color: root.border
                                        border.width: 1
                                    }
                                    onTextChanged: page.vehiclePlateNo = text
                                }
                            }
                        }

                        // Confirm Password Field
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 80

                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 6

                                Text {
                                    text: "Confirm Password"
                                    color: root.textDim
                                    font.pixelSize: 11
                                }

                                TextField {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 48
                                    text: page.confirmPassword
                                    echoMode: TextInput.Password
                                    color: root.text
                                    placeholderTextColor: root.textDim
                                    background: Rectangle {
                                        anchors.fill: parent
                                        color: root.bg
                                        border.color: root.border
                                        border.width: 1
                                    }
                                    onTextChanged: page.confirmPassword = text
                                }
                            }
                        }
                    }
                }

                // Buttons Row
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10

                    Button {
                        text: "SUBMIT"
                        Layout.preferredWidth: 120
                        Layout.preferredHeight: 56
                        font.pixelSize: 13
                        font.bold: true
                        background: Rectangle {
                            color: root.accentGreen
                        }
                        contentItem: Text {
                            text: parent.text
                            color: root.bg
                            font: parent.font
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                        onClicked: submitForm()
                    }

                    Button {
                        text: "UPDATE"
                        Layout.preferredWidth: 120
                        Layout.preferredHeight: 56
                        font.pixelSize: 13
                        font.bold: true
                        background: Rectangle {
                            color: root.iconColor
                        }
                        contentItem: Text {
                            text: parent.text
                            color: root.bg
                            font: parent.font
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                        onClicked: updateForm()
                    }

                    Text {
                        id: statusLabel
                        Layout.fillWidth: true
                        Layout.leftMargin: 16
                        text: page.status
                        color: page.statusColor
                        font.pixelSize: 11
                    }
                }
            }
        }

        // Back Button
        Item {
            Layout.preferredHeight: 80
            Layout.alignment: Qt.AlignHCenter

            Rectangle {
                anchors.centerIn: parent
                color: root.borderHover

                Rectangle {
                    anchors.fill: parent
                    anchors.margins: 2
                    color: "transparent"

                    Button {
                        anchors.fill: parent
                        text: "←  BACK TO MAIN"
                        font.pixelSize: 13
                        font.bold: true
                        background: Rectangle {
                            color: parent.hovered ? root.bgCard : root.bg
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
    }

    function submitForm() {
        if (password !== confirmPassword) {
            status = "Password and Confirm Password do not match"
            statusColor = root.errorRed
            return
        }

        status = "Saving..."
        statusColor = root.textDim
        machineBridge.submitMachineInfo(machineId, clientName, location, vehiclePlateNo, password)
    }

    function handleSubmitResult(result) {
        if (result === "success") {
            status = "Saved successfully"
            statusColor = root.accentGreenBright
            unlocked = true
        } else if (result === "duplicate") {
            updateFromDuplicateSubmit = true
            status = "Updating..."
            statusColor = root.textDim
            machineBridge.updateMachineInfo(machineId, clientName, location, vehiclePlateNo, password)
        } else {
            status = "Error"
            statusColor = root.errorRed
        }
    }

    function updateForm() {
        if (password !== confirmPassword) {
            status = "Password and Confirm Password do not match"
            statusColor = root.errorRed
            return
        }

        var data = machineBridge.loadMachineInfo()
        if (!data || !data.machineId) {
            status = "No machine info saved yet"
            statusColor = root.errorRed
            return
        }

        status = "Updating..."
        statusColor = root.textDim
        machineBridge.updateMachineInfo(machineId, clientName, location, vehiclePlateNo, password)
    }

    function handleUpdateResult(result) {
        if (result === "success") {
            if (updateFromDuplicateSubmit) {
                status = "Updated successfully (this Machine ID was already registered)"
                updateFromDuplicateSubmit = false
            } else {
                status = "Updated successfully"
            }
            statusColor = root.accentGreenBright
            unlocked = true
        } else {
            updateFromDuplicateSubmit = false
            status = "Error"
            statusColor = root.errorRed
        }
    }
}
