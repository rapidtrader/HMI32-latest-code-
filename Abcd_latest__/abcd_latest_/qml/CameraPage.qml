import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12
import HmiCamera 1.0
import HmiMdvr 1.0

Rectangle {
    id: cameraRoot
    color: root.bg

    readonly property int localCount: cameraController.cameraCount()
    readonly property int mdvrCount: mdvrController.mdvrPortCount

    function ensurePreviewRunning() {
        if (!cameraController.gstBlocked && !cameraController.isActive && !cameraController.isBusy)
            cameraController.launchVendorDemo()
        if (!mdvrController.isActive && !mdvrController.isBusy)
            mdvrController.startAll()
    }

    Component.onCompleted: ensurePreviewRunning()

    ScrollView {
        anchors.fill: parent
        anchors.margins: 8
        clip: true
        ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

        ColumnLayout {
            width: cameraRoot.width - 16
            spacing: 8

            Text {
                Layout.fillWidth: true
                text: "Cameras — BNC + MDVR"
                color: root.iconColor
                font.pixelSize: 18
                font.bold: true
                horizontalAlignment: Text.AlignHCenter
            }

            Text {
                id: statusText
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                color: root.accentOrange
                font.pixelSize: 11
                horizontalAlignment: Text.AlignHCenter
                text: ""
            }

            // —— Row 1: onboard AHD (BNC) — 4 in one row ——
            Text {
                Layout.fillWidth: true
                text: cameraController.gstBlocked
                    ? ("BNC: " + cameraController.gstBlockHint)
                    : "BNC (local V4L2)"
                color: root.textDim
                font.pixelSize: 11
            }

            GridLayout {
                Layout.fillWidth: true
                columns: 4
                columnSpacing: 6
                rowSpacing: 6

                Repeater {
                    model: localCount

                    delegate: Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredWidth: (cameraRoot.width - 40) / 4
                        Layout.preferredHeight: 130
                        color: "#0a0a0a"
                        border.color: root.border
                        border.width: 1
                        radius: 4
                        clip: true

                        property int camId: index + 1
                        property bool streamOn: cameraController.streamEnabled(camId)
                        property bool hasSignal: cameraController.channelProbeOk(camId)

                        Rectangle {
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.top: parent.top
                            height: 20
                            color: "#141414"
                            Text {
                                anchors.fill: parent
                                anchors.leftMargin: 4
                                verticalAlignment: Text.AlignVCenter
                                color: root.text
                                font.pixelSize: 9
                                elide: Text.ElideRight
                                text: "BNC " + camId
                            }
                        }

                        Loader {
                            anchors.fill: parent
                            anchors.topMargin: 20
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

                        Text {
                            anchors.centerIn: parent
                            anchors.verticalCenterOffset: 8
                            visible: !cameraController.isActive
                                || !streamOn
                                || (cameraController.isActive && !hasSignal)
                            color: root.textDim
                            font.pixelSize: 10
                            horizontalAlignment: Text.AlignHCenter
                            text: cameraController.isActive && !hasSignal ? "No signal" : "BNC " + camId
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 1
                color: root.border
            }

            // —— MDVR RTSP — 8 ports (4 columns × 2 rows) ——
            Text {
                Layout.fillWidth: true
                text: "MDVR · " + mdvrCount + " ch · " + mdvrController.mdvrHost
                    + " · " + mdvrController.streamProfile
                    + " (stream/av1…av" + mdvrCount + "_1)"
                color: root.textDim
                font.pixelSize: 11
            }

            GridLayout {
                Layout.fillWidth: true
                columns: 4
                columnSpacing: 6
                rowSpacing: 6

                Repeater {
                    model: mdvrCount

                    delegate: Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredWidth: (cameraRoot.width - 40) / 4
                        Layout.preferredHeight: mdvrCount > 4 ? 110 : 130
                        color: "#0a0a0a"
                        border.color: "#2a4a62"
                        border.width: 1
                        radius: 4
                        clip: true

                        property int camId: index + 1
                        property bool streamOn: mdvrController.streamEnabled(camId)
                        property bool hasSignal: mdvrController.channelProbeOk(camId)

                        Rectangle {
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.top: parent.top
                            height: 20
                            color: "#141820"
                            Text {
                                anchors.fill: parent
                                anchors.leftMargin: 4
                                verticalAlignment: Text.AlignVCenter
                                color: root.text
                                font.pixelSize: 9
                                elide: Text.ElideRight
                                text: "MDVR " + camId + "  " + mdvrController.streamUrl(camId)
                            }
                        }

                        Loader {
                            anchors.fill: parent
                            anchors.topMargin: 22
                            // All 8 ports: try stream even if probe failed on empty BNC
                            active: mdvrController.isActive && streamOn
                            sourceComponent: Component {
                                MdvrVideo {
                                    channelId: camId
                                    active: true
                                    anchors.fill: parent
                                    onStatusChanged: function (message) {
                                        statusText.text = message
                                    }
                                }
                            }
                        }

                        Text {
                            anchors.centerIn: parent
                            anchors.verticalCenterOffset: 8
                            visible: !mdvrController.isActive || !streamOn
                            color: root.textDim
                            font.pixelSize: 10
                            horizontalAlignment: Text.AlignHCenter
                            text: "MDVR " + camId + (hasSignal ? "" : " (trying…)")
                        }
                    }
                }
            }

            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: 8
            }
        }
    }

    Connections {
        target: cameraController
        onStatusChanged: function (message) {
            statusText.text = message
        }
    }
    Connections {
        target: mdvrController
        onStatusChanged: function (message) {
            statusText.text = message
        }
    }
}
