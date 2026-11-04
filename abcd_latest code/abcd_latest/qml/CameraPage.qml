import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12
import HmiCamera 1.0

Rectangle {
    id: cameraRoot
    color: root.bg

    readonly property int channelCount: cameraController.cameraCount()

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10

        Text {
            Layout.fillWidth: true
            text: channelCount === 1 ? "Camera" : ("Cameras (" + channelCount + " ch)")
            color: root.iconColor
            font.pixelSize: 20
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
        }

        Text {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            color: root.textDim
            font.pixelSize: 11
            horizontalAlignment: Text.AlignHCenter
            text: "Start all = live view on Pi. Website clips: set CAMERA_AUTO_SAVE=1 when stable."
        }

        GridLayout {
            id: camGrid
            Layout.fillWidth: true
            Layout.fillHeight: true
            columns: channelCount <= 1 ? 1 : 2
            rowSpacing: 8
            columnSpacing: 8

            Repeater {
                model: channelCount

                delegate: Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumWidth: 120
                    Layout.minimumHeight: channelCount <= 2 ? 160 : 120
                    color: "#0a0a0a"
                    border.color: root.border
                    border.width: 1
                    radius: 4
                    clip: true

                    property int chIndex: index
                    property int camId: index + 1
                    property bool streamOn: cameraController.streamEnabled(camId)
                    property string devLabel: "CH" + (chIndex + 1) + "  " + cameraController.devicePath(camId)

                    property bool hasSignal: cameraController.channelProbeOk(camId)

                    Loader {
                        id: previewLoader
                        anchors.fill: parent
                        anchors.margins: 1
                        anchors.topMargin: 22
                        active: cameraController.isActive && streamOn && hasSignal
                            && !cameraController.previewGlobalHold
                            && !cameraController.isRecordingChannel(camId)
                            && !cameraController.isChannelPreviewPaused(camId)
                        sourceComponent: Component {
                            GStreamerVideo {
                                cameraId: camId
                                active: true
                                anchors.fill: parent
                                onStatusChanged: function (message) {
                                    statusText.text = message
                                }
                            }
                        }
                    }

                    Rectangle {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        height: 22
                        color: "#141414"
                        Text {
                            anchors.fill: parent
                            anchors.leftMargin: 6
                            verticalAlignment: Text.AlignVCenter
                            color: root.text
                            font.pixelSize: 11
                            elide: Text.ElideRight
                            text: devLabel
                        }
                    }

                    Text {
                        anchors.centerIn: parent
                        anchors.verticalCenterOffset: 8
                        visible: !cameraController.isActive
                            || (cameraController.isActive && !streamOn)
                            || (cameraController.isActive && streamOn && !hasSignal)
                        color: root.textDim
                        font.pixelSize: 12
                        horizontalAlignment: Text.AlignHCenter
                        text: {
                            if (!cameraController.isActive)
                                return "CH" + (chIndex + 1)
                            if (!streamOn)
                                return "CH" + (chIndex + 1) + "\noff (CAMERA_STREAM_IDS)"
                            if (!hasSignal)
                                return "CH" + (chIndex + 1) + "\nNo camera\n(BNC + 12V?)"
                            return ""
                        }
                    }
                }
            }
        }

        Text {
            id: statusText
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            color: root.accentOrange
            font.pixelSize: 12
            horizontalAlignment: Text.AlignHCenter
            text: ""
        }

        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            spacing: 12
            Button {
                Layout.preferredWidth: 180
                Layout.preferredHeight: 44
                enabled: !cameraController.isBusy
                text: cameraController.isBusy
                    ? "Starting…"
                    : (cameraController.isActive ? "Stop all" : "Start all")
                onClicked: {
                    if (cameraController.isActive)
                        cameraController.stopVendorDemo()
                    else if (!cameraController.isBusy)
                        cameraController.launchVendorDemo()
                }
            }
        }
    }

    Component.onDestruction: {
        if (cameraController.isActive)
            cameraController.stopVendorDemo()
    }

    Connections {
        target: cameraController
        onStatusChanged: function (message) {
            statusText.text = message
            console.log("[CameraPage]", message)
        }
    }
}
