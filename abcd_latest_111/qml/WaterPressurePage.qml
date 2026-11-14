import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: waterPressureRoot
    color: "#091016"
    anchors.fill: parent

    // ================= COLORS =================
    property string bgCard: "#131c22"
    property string bgBox: "#0d1a28"
    property string borderColor: "#11e4de"
    property string iconColor: "#11e4de"
    property string textMain: "#e6ecef"
    property string textDim: "#7f8d96"
    property string green: "#00e676"
    property string amber: "#e6a900"
    property string red: "#e74c3c"

    // ================= PA0 ANALOG DATA =================
    property int pa0AdcValue: 0

    // STM32 ADC reference = 3.3V
    property real adcRefVoltage: 3.3

    // Agar voltage divider 10k + 20k use kiya hai:
    // Sensor OUT ---- 10k ---- PA0 ---- 20k ---- GND
    // then Sensor Voltage = PA0 Voltage * 1.5
    property real voltageDividerScale: 1.5

    // Actual sensor voltage
    property real pa0Voltage: (pa0AdcValue / 4095.0) * adcRefVoltage * voltageDividerScale

    property real pa0PressureMPa: 0.0
    property real pa0WaterHeightCm: 0.0

    function calculatePa0Values() {
        // Sensor range:
        // 0.52V = 0 MPa
        // 4.50V = 0.1 MPa

        if (pa0Voltage <= 0.52) {
            pa0PressureMPa = 0.0
        } else if (pa0Voltage >= 4.5) {
            pa0PressureMPa = 0.1
        } else {
            pa0PressureMPa = (pa0Voltage - 0.52) * (0.1 / (4.5 - 0.52))
        }

        // P = rho * g * h
        // h = P / (rho * g)
        // 1 MPa = 1000000 Pa
        var pressurePa = pa0PressureMPa * 1000000.0
        pa0WaterHeightCm = (pressurePa / (1000.0 * 9.81)) * 100.0
    }

    function refreshData() {
        if (typeof machineBridge !== "undefined") {
            pa0AdcValue = machineBridge.getPa0Adc()
        }

        calculatePa0Values()

        if (pa0Indicator) {
            pa0Indicator.requestPaint()
        }

        console.log(
            "PA0 UI ADC:",
            pa0AdcValue,
            "Sensor V:",
            pa0Voltage,
            "MPa:",
            pa0PressureMPa,
            "Height:",
            pa0WaterHeightCm
        )
    }

    Component.onCompleted: {
        refreshData()
        autoRefreshTimer.start()
        console.log("Water Pressure Sensor page loaded")
    }

    Connections {
        target: machineBridge

        onPa0AdcChanged: {
            pa0AdcValue = arguments[0]
            calculatePa0Values()

            if (pa0Indicator) {
                pa0Indicator.requestPaint()
            }

            console.log(
                "PA0 SIGNAL ADC:",
                pa0AdcValue,
                "Sensor V:",
                pa0Voltage,
                "MPa:",
                pa0PressureMPa,
                "Height:",
                pa0WaterHeightCm
            )
        }
    }

    Timer {
        id: autoRefreshTimer
        interval: 200
        repeat: true
        running: false
        onTriggered: refreshData()
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 20

        // ================= HEADER =================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 60
            color: bgCard
            border.color: borderColor
            border.width: 2
            radius: 8

            Text {
                anchors.centerIn: parent
                text: "Water Pressure Sensor"
                color: iconColor
                font.pixelSize: 28
                font.bold: true
            }
        }

        // ================= DATA CARDS =================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 350
            color: bgCard
            border.color: iconColor
            border.width: 3
            radius: 12

            GridLayout {
                anchors.fill: parent
                anchors.margins: 30
                columns: 2
                rowSpacing: 30
                columnSpacing: 30

                // ADC Value
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: bgBox
                    border.color: borderColor
                    border.width: 2
                    radius: 8

                    ColumnLayout {
                        anchors.centerIn: parent
                        spacing: 8

                        Text {
                            text: "RAW ADC"
                            color: textDim
                            font.pixelSize: 14
                            font.bold: true
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: pa0AdcValue
                            color: iconColor
                            font.pixelSize: 48
                            font.bold: true
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: "0 - 4095"
                            color: textDim
                            font.pixelSize: 12
                            Layout.alignment: Qt.AlignHCenter
                        }
                    }
                }

                // Voltage
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: bgBox
                    border.color: borderColor
                    border.width: 2
                    radius: 8

                    ColumnLayout {
                        anchors.centerIn: parent
                        spacing: 8

                        Text {
                            text: "SENSOR VOLTAGE"
                            color: textDim
                            font.pixelSize: 14
                            font.bold: true
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: pa0Voltage.toFixed(3) + " V"
                            color: iconColor
                            font.pixelSize: 48
                            font.bold: true
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: "0.52 - 4.50 V"
                            color: textDim
                            font.pixelSize: 12
                            Layout.alignment: Qt.AlignHCenter
                        }
                    }
                }

                // Pressure
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: bgBox
                    border.color: borderColor
                    border.width: 2
                    radius: 8

                    ColumnLayout {
                        anchors.centerIn: parent
                        spacing: 8

                        Text {
                            text: "PRESSURE"
                            color: textDim
                            font.pixelSize: 14
                            font.bold: true
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: pa0PressureMPa.toFixed(5) + " MPa"
                            color: iconColor
                            font.pixelSize: 48
                            font.bold: true
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: "0 - 0.1 MPa"
                            color: textDim
                            font.pixelSize: 12
                            Layout.alignment: Qt.AlignHCenter
                        }
                    }
                }

                // Water Height
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: bgBox
                    border.color: borderColor
                    border.width: 2
                    radius: 8

                    ColumnLayout {
                        anchors.centerIn: parent
                        spacing: 8

                        Text {
                            text: "WATER HEIGHT"
                            color: textDim
                            font.pixelSize: 14
                            font.bold: true
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: pa0WaterHeightCm.toFixed(1) + " cm"
                            color: iconColor
                            font.pixelSize: 48
                            font.bold: true
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: "0 - 1019.4 cm"
                            color: textDim
                            font.pixelSize: 12
                            Layout.alignment: Qt.AlignHCenter
                        }
                    }
                }
            }
        }

        // ================= VISUAL INDICATOR =================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 120
            color: bgCard
            border.color: borderColor
            border.width: 2
            radius: 8

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 15
                spacing: 8

                Text {
                    Layout.alignment: Qt.AlignHCenter
                    text: "ADC LEVEL"
                    color: textDim
                    font.pixelSize: 14
                    font.bold: true
                }

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                    Canvas {
                        id: pa0Indicator
                        anchors.fill: parent

                        onPaint: {
                            var ctx = getContext("2d")
                            ctx.clearRect(0, 0, width, height)

                            var progress = pa0AdcValue / 4095.0

                            if (progress < 0) progress = 0
                            if (progress > 1) progress = 1

                            var barWidth = width * 0.85
                            var barHeight = 36
                            var x = (width - barWidth) / 2
                            var y = (height - barHeight) / 2

                            ctx.fillStyle = "#0d151a"
                            ctx.fillRect(x, y, barWidth, barHeight)

                            var fillWidth = barWidth * progress

                            if (progress < 0.33) {
                                ctx.fillStyle = green
                            } else if (progress < 0.66) {
                                ctx.fillStyle = amber
                            } else {
                                ctx.fillStyle = red
                            }

                            ctx.fillRect(x, y, fillWidth, barHeight)

                            ctx.strokeStyle = iconColor
                            ctx.lineWidth = 2
                            ctx.strokeRect(x, y, barWidth, barHeight)
                        }
                    }

                    Text {
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.verticalCenter: parent.verticalCenter
                        text: Math.round((pa0AdcValue / 4095.0) * 100) + "%"
                        color: "#ffffff"
                        font.pixelSize: 18
                        font.bold: true
                    }
                }
            }
        }

        Item {
            Layout.fillHeight: true
        }
    }
}