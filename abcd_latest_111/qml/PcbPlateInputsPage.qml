import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: pcbPlateRoot
    anchors.fill: parent
    color: "#091016"

    property color bgCard: "#131c22"
    property color borderColor: "#11e4de"
    property color textMain: "#e6ecef"
    property color textDim: "#7f8d96"
    property color greenOn: "#00e676"
    property color redOff: "#e74c3c"

    ListModel {
        id: inputModel
        ListElement { inputIndex: 1;  label: "F_IN01"; pin: "PD7";  connected: 0 }
        ListElement { inputIndex: 2;  label: "F_IN02"; pin: "PD4";  connected: 0 }
        ListElement { inputIndex: 3;  label: "F_IN03"; pin: "PD3";  connected: 0 }
        ListElement { inputIndex: 4;  label: "F_IN04"; pin: "PA12"; connected: 0 }
        ListElement { inputIndex: 5;  label: "F_IN05"; pin: "PA15"; connected: 0 }
        ListElement { inputIndex: 6;  label: "F_IN06"; pin: "PA11"; connected: 0 }
        ListElement { inputIndex: 7;  label: "F_IN07"; pin: "PA8";  connected: 0 }
        ListElement { inputIndex: 8;  label: "F_IN08"; pin: "PC8";  connected: 0 }
        ListElement { inputIndex: 9;  label: "F_IN09"; pin: "PC9";  connected: 0 }
        ListElement { inputIndex: 10; label: "F_IN10"; pin: "PD14"; connected: 0 }
        ListElement { inputIndex: 11; label: "F_IN11"; pin: "PD12"; connected: 0 }
        ListElement { inputIndex: 12; label: "F_IN12"; pin: "PD10"; connected: 0 }
        ListElement { inputIndex: 13; label: "F_IN13"; pin: "PD15"; connected: 0 }
        ListElement { inputIndex: 14; label: "F_IN14"; pin: "PD13"; connected: 0 }
        ListElement { inputIndex: 15; label: "F_IN15"; pin: "PD11"; connected: 0 }
        ListElement { inputIndex: 16; label: "F_IN16"; pin: "PB15"; connected: 0 }
    }

    function rowColor(connected) {
        return connected ? greenOn : redOff
    }

    function updateRowState(inputIndex, state) {
        for (var i = 0; i < inputModel.count; i++) {
            if (inputModel.get(i).inputIndex === inputIndex) {
                var on = (state === 1)
                if (inputModel.get(i).connected !== (on ? 1 : 0))
                    inputModel.setProperty(i, "connected", on ? 1 : 0)
                return
            }
        }
    }

    function refreshAllStates() {
        if (typeof machineBridge === "undefined")
            return
        for (var i = 0; i < inputModel.count; i++) {
            var idx = inputModel.get(i).inputIndex
            updateRowState(idx, machineBridge.getDigitalInputState(idx))
        }
    }

    Component.onCompleted: {
        refreshAllStates()
        pollTimer.start()
    }

    Connections {
        target: (typeof machineBridge !== "undefined") ? machineBridge : null
        onDigitalInputStateChanged: updateRowState(arguments[0], arguments[1])
    }

    Timer {
        id: pollTimer
        interval: 1000
        repeat: true
        running: false
        onTriggered: pcbPlateRoot.refreshAllStates()
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 16

        Text {
            Layout.fillWidth: true
            text: "PCB Plate — Digital Inputs"
            color: borderColor
            font.pixelSize: 26
            font.bold: true
        }

        Text {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            color: textDim
            font.pixelSize: 14
            text: "Wire / plate ON → GREEN · open → RED"
        }

        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            ScrollBar.vertical.policy: ScrollBar.AsNeeded
            ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

            GridView {
                id: inputGrid
                width: parent.width
                height: contentHeight
                interactive: false
                cellWidth: Math.max(280, width / 2)
                cellHeight: 78
                model: inputModel

                delegate: Rectangle {
                    width: inputGrid.cellWidth - 6
                    height: inputGrid.cellHeight - 6
                    radius: 8
                    color: bgCard
                    border.color: rowColor(model.connected)
                    border.width: 2

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 12
                        spacing: 12

                        Rectangle {
                            width: 22
                            height: 22
                            radius: 11
                            color: rowColor(model.connected)
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2

                            Text {
                                text: model.label + "  ·  " + model.pin
                                color: textMain
                                font.pixelSize: 16
                                font.bold: true
                            }

                            Text {
                                text: model.connected ? "ON (wire OK)" : "OFF"
                                color: rowColor(model.connected)
                                font.pixelSize: 13
                            }
                        }
                    }
                }
            }
        }
    }
}