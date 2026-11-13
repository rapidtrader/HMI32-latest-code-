import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: gpsRoot
    color: root.bg

    property var trackPoints: []
    property var recentPointRows: []
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
        if (gpsController.hasCoordinates) {
            var clat = gpsController.latitude
            var clon = gpsController.longitude
            if (clat < minLat) minLat = clat
            if (clat > maxLat) maxLat = clat
            if (clon < minLon) minLon = clon
            if (clon > maxLon) maxLon = clon
        }
        var showN = Math.min(35, trackPoints.length)
        var start = trackPoints.length - showN
        var rows = []
        for (var j = trackPoints.length - 1; j >= start; j--) {
            var pt = trackPoints[j]
            rows.push({
                idx: j + 1,
                lat: pt.latitude,
                lon: pt.longitude,
                ts: pt.timestamp || "—"
            })
        }
        recentPointRows = rows
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
                text: gpsController.fixValid
                    ? "VALID"
                    : (gpsController.satellites > 0
                        ? ("WAITING (" + gpsController.satellites + " sats)")
                        : "SEARCHING")
                color: gpsController.fixValid ? root.accentGreen : root.accentOrange
                font.pixelSize: 12
                font.bold: true
            }

            Text { text: "Latitude"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.hasCoordinates
                    ? gpsController.latitude.toFixed(6)
                    : "—"
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "Longitude"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.hasCoordinates
                    ? gpsController.longitude.toFixed(6)
                    : "—"
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "Speed"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.fixValid
                    ? (gpsController.speedKmh.toFixed(1) + " km/h")
                    : "—"
                color: root.text
                font.pixelSize: 12
            }

            Text { text: "Altitude"; color: root.textDim; font.pixelSize: 12 }
            Text {
                text: gpsController.fixValid
                    ? (gpsController.altitude.toFixed(1) + " m")
                    : "—"
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
            Layout.minimumHeight: 140
            Layout.preferredHeight: 200
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

                    for (var di = 0; di < trackPoints.length; di++) {
                        var pd = xy(trackPoints[di].latitude, trackPoints[di].longitude)
                        var isFirst = di === 0
                        var isLast = di === trackPoints.length - 1
                        ctx.fillStyle = isFirst ? "#ffab40" : (isLast ? "#80deea" : "#00e5ff")
                        ctx.beginPath()
                        ctx.arc(pd.x, pd.y, isFirst || isLast ? 4 : 2.5, 0, Math.PI * 2)
                        ctx.fill()
                    }

                    if (gpsController.hasCoordinates) {
                        var cur = xy(gpsController.latitude, gpsController.longitude)
                        ctx.fillStyle = "#00e676"
                        ctx.beginPath()
                        ctx.arc(cur.x, cur.y, 6, 0, Math.PI * 2)
                        ctx.fill()
                    }
                }
            }

            Text {
                anchors.left: parent.left
                anchors.top: parent.top
                anchors.margins: 10
                visible: trackPoints.length > 0
                color: root.textDim
                font.pixelSize: 10
                text: "Line: " + trackPoints.length + " pts · cyan route · orange=start · green=now"
            }

            Text {
                anchors.centerIn: parent
                visible: !gpsController.fixValid && !gpsController.hasCoordinates
                color: root.textDim
                font.pixelSize: 12
                horizontalAlignment: Text.AlignHCenter
                text: {
                    var st = gpsController.statusText || ""
                    var sats = gpsController.satellites
                    if (st.indexOf("tracking on") >= 0) {
                        if (sats >= 4)
                            return "GPS active — " + sats + " satellites visible; computing position…\n" + st
                        if (sats > 0)
                            return "GPS active — " + sats + " satellites (weak signal). Point antenna up / move outdoors.\n" + st
                        return "GPS active — searching for satellites (1–5 min).\nCheck antenna connection.\n" + st
                    }
                    return "Starting GPS…\n" + st
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 130
            color: root.bgCard
            border.color: root.border
            border.width: 1
            radius: 4
            clip: true

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 8
                spacing: 4

                Text {
                    Layout.fillWidth: true
                    text: "Data points (newest first, same as map line)"
                    color: root.iconColor
                    font.pixelSize: 11
                    font.bold: true
                }

                ListView {
                    id: pointList
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: 2
                    model: gpsRoot.recentPointRows
                    boundsBehavior: Flickable.StopAtBounds
                    ScrollBar.vertical: ScrollBar {
                        policy: ScrollBar.AsNeeded
                    }

                    delegate: Rectangle {
                        width: pointList.width
                        height: 20
                        color: index === 0 ? "#1a2836" : "transparent"
                        radius: 2

                        Text {
                            anchors.fill: parent
                            anchors.leftMargin: 6
                            anchors.rightMargin: 4
                            verticalAlignment: Text.AlignVCenter
                            elide: Text.ElideRight
                            color: index === 0 ? root.accentGreen : root.text
                            font.pixelSize: 10
                            font.family: root.fontMono
                            text: "#" + modelData.idx + "  "
                                + Number(modelData.lat).toFixed(6) + ", "
                                + Number(modelData.lon).toFixed(6)
                                + (modelData.ts !== "—" ? ("  ·  " + modelData.ts) : "")
                        }
                    }
                }

                Text {
                    Layout.fillWidth: true
                    visible: recentPointRows.length === 0
                    text: gpsController.hasCoordinates
                        ? "Collecting points — map line grows as you move…"
                        : "No points yet — waiting for GPS position"
                    color: root.textDim
                    font.pixelSize: 10
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 88
            color: root.bgCard
            border.color: gpsController.fixValid ? root.accentGreen : root.border
            border.width: 1
            radius: 4

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 10
                spacing: 4

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    Rectangle {
                        width: 8
                        height: 8
                        radius: 4
                        color: gpsController.fixValid ? root.accentGreen : root.ledOff
                    }

                    Text {
                        Layout.fillWidth: true
                        text: gpsController.saveLocalLine
                        color: root.text
                        font.pixelSize: 11
                        elide: Text.ElideRight
                    }
                }

                Text {
                    Layout.fillWidth: true
                    text: gpsController.saveTrackLine
                    color: root.textDim
                    font.pixelSize: 10
                    elide: Text.ElideRight
                }

                Text {
                    Layout.fillWidth: true
                    text: gpsController.saveServerLine
                    color: gpsController.saveServerOk ? root.accentGreen : root.accentOrange
                    font.pixelSize: 10
                    elide: Text.ElideRight
                }
            }
        }
    }
}
