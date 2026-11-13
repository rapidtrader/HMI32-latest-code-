import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12
import HmiMdvr 1.0

Rectangle {
    id: mdvrRoot
    color: root.bg

    readonly property int channelCount: mdvrController.channelCount()

    Component.onCompleted: {
        if (cameraController.isActive)
            cameraController.stopVendorDemo()
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10

        Text {
            Layout.fillWidth: true
            text: "4G MDVR — Live"
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
            text: "Host " + mdvrController.mdvrHost + " · " + mdvrController.streamProfile
                + " · need Ethernet on 192.168.31.x (not WiFi-only)"
        }

        GridLayout {
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

                    property int camId: index + 1
                    property bool streamOn: mdvrController.streamEnabled(camId)
                    property bool hasSignal: mdvrController.channelProbeOk(camId)

                    Rectangle {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        height: 26
                        color: "#141414"
                        Text {
                            anchors.fill: parent
                            anchors.leftMargin: 6
                            verticalAlignment: Text.AlignVCenter
                            color: root.text
                            font.pixelSize: 10
                            elide: Text.ElideRight
                            text: "CH" + camId + "  " + mdvrController.streamUrl(camId)
                        }
                    }

                    Loader {
                        anchors.fill: parent
                        anchors.margins: 1
                        anchors.topMargin: 26
                        active: mdvrController.isActive && streamOn && hasSignal
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
                        anchors.verticalCenterOffset: 10
                        visible: !mdvrController.isActive
                            || (mdvrController.isActive && !streamOn)
                            || (mdvrController.isActive && streamOn && !hasSignal)
                        color: root.textDim
                        font.pixelSize: 12
                        horizontalAlignment: Text.AlignHCenter
                        text: {
                            if (!mdvrController.isActive)
                                return "CH" + camId
                            if (!streamOn)
                                return "CH" + camId + "\noff (MDVR_STREAM_IDS)"
                            if (!hasSignal)
                                return "CH" + camId + "\nNo stream"
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
                Layout.preferredWidth: 200
                Layout.preferredHeight: 44
                enabled: !mdvrController.isBusy
                text: mdvrController.isBusy
                    ? "Starting…"
                    : (mdvrController.isActive ? "Stop MDVR" : "Start MDVR")
                onClicked: {
                    if (mdvrController.isActive)
                        mdvrController.stopAll()
                    else if (!mdvrController.isBusy)
                        mdvrController.startAll()
                }
            }
        }
    }

    Connections {
        target: mdvrController
        onStatusChanged: function (message) {
            statusText.text = message
        }
    }
}
