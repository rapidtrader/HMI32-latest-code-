import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: gpsRoot
    color: root.bg

    property var trackPoints: []
    property real minLat: 0
    property real maxLat: 0
    property real minLon: 0
    property real maxLon: 0

    function reloadTrack() {
        try {
            trackPoints = JSON.parse(gpsController.trackPointsJson())
        } catch (e) {
            trackPoints = []
        }
        if (trackPoints.length === 0) {
            minLat = maxLat = gpsController.latitude
            minLon = maxLon = gpsController.longitude
            return
        }
        minLat = 999
        maxLat = -999
        minLon = 999
        maxLon = -999
        for (var i = 0; i < trackPoints.length; i++) {
            var p = trackPoints[i]
            if (p.latitude < minLat) minLat = p.latitude
            if (p.latitude > maxLat) maxLat = p.latitude
            if (p.longitude < minLon) minLon = p.longitude
            if (p.longitude > maxLon) maxLon = p.longitude
        }
        trackCanvas.requestPaint()
    }

    Timer {
        interval: 1000
        running: true
        repeat: true
        onTriggered: reloadTrack()
    }

    Connections {
        target: gpsController
        onFixChanged: reloadTrack()
    }

    Component.onCompleted: reloadTrack()

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10

        Text {
            Layout.fillWidth: true
            text: "GPS Track"
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
            text: "Parser: gps-code (GPGGA/GPRMC). Port: " + (gpsController.statusText)
        }

        GridLayout {
            Layout.fillWidth: true
            columns: 2
            columnSpacing: 16
            rowSpacing: 6

            Text { text: "Fix"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.fixValid ? "VALID" : "NO FIX"
                color: gpsController.fixValid ? root.accentGreen : root.accentOrange
                font.pixelSize: 12
                font.bold: true
            }

            Text { text: "Latitude"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.fixValid ? gpsController.latitude.toFixed(6) : "—"
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "Longitude"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.fixValid ? gpsController.longitude.toFixed(6) : "—"
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "Speed"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.speedKmh.toFixed(1) + " km/h"
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "Altitude"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.altitude.toFixed(1) + " m"
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "Satellites"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.satellites
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "Track points"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.trackPointCount
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "UTC / time"; color: root.textDim; font.pixelSize: 12 }
            Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                text: gpsController.lastTimestamp || "—"
                color: root.textDim
                font.pixelSize: 10
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: 180
            color: "#0a0a0a"
            border.color: root.border
            border.width: 1
            radius: 4
            clip: true

            Canvas {
                id: trackCanvas
                anchors.fill: parent
                anchors.margins: 8

                onPaint: {
                    var ctx = getContext("2d")
                    ctx.reset()
                    ctx.fillStyle = "#0a0a0a"
                    ctx.fillRect(0, 0, width, height)
                    if (trackPoints.length < 1)
                        return
                    var pad = 12
                    var w = width - 2 * pad
                    var h = height - 2 * pad
                    var latSpan = maxLat - minLat
                    var lonSpan = maxLon - minLon
                    if (latSpan < 1e-6) latSpan = 1e-4
                    if (lonSpan < 1e-6) lonSpan = 1e-4

                    function xy(lat, lon) {
                        var x = pad + (lon - minLon) / lonSpan * w
                        var y = pad + (1.0 - (lat - minLat) / latSpan) * h
                        return { x: x, y: y }
                    }

                    if (trackPoints.length >= 2) {
                        ctx.strokeStyle = "#00e5ff"
                        ctx.lineWidth = 2
                        ctx.beginPath()
                        var p0 = xy(trackPoints[0].latitude, trackPoints[0].longitude)
                        ctx.moveTo(p0.x, p0.y)
                        for (var i = 1; i < trackPoints.length; i++) {
                            var pi = xy(trackPoints[i].latitude, trackPoints[i].longitude)
                            ctx.lineTo(pi.x, pi.y)
                        }
                        ctx.stroke()
                    }

                    if (gpsController.fixValid) {
                        var cur = xy(gpsController.latitude, gpsController.longitude)
                        ctx.fillStyle = "#00e676"
                        ctx.beginPath()
                        ctx.arc(cur.x, cur.y, 6, 0, Math.PI * 2)
                        ctx.fill()
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: trackPoints.length === 0 && !gpsController.fixValid
                color: root.textDim
                font.pixelSize: 13
                text: "Waiting for GPS fix…\nCheck GPS_SERIAL_PORT / modem AT port"
            }
        }
    }
}
