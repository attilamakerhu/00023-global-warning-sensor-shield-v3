input.onButtonPressed(Button.AB, function () {
    if (DEBUG == 0) {
        DEBUG = 1
        led.plot(0, 4)
    } else if (DEBUG == 1) {
        DEBUG = 2
        led.plot(0, 4)
        led.plot(1, 4)
    } else {
        DEBUG = 0
        led.unplot(0, 4)
        led.unplot(1, 4)
    }
})
function collect_data () {
    // value given in kPa
    pres = BME280.pressure(BME280_P.Pa) / 1000
    // value given in percentage
    hum = BME280.humidity()
    // value given in Celsius degrees
    temp = BME280.temperature(BME280_T.T_C)
    // value given in ppm
    eco2 = ENS160.eCO2()
    // value given in ppb
    tvoc = ENS160.TVOC()
    // value given between 0 and 255
    bright = Math.map(pins.analogReadPin(AnalogPin.P1), 0, 1023, 0, 255)
}
// Broadcast environmental data one by one
function broadcast_data () {
    // adatküldés rádióra
    radio.sendValue("temperature", temp)
    basic.pause(broadcast_message_delay)
    radio.sendValue("eco2", eco2)
    basic.pause(broadcast_message_delay)
    radio.sendValue("light", bright)
    basic.pause(broadcast_message_delay)
    radio.sendValue("voc", tvoc)
    basic.pause(broadcast_message_delay)
    radio.sendValue("humidity", hum)
    basic.pause(broadcast_message_delay)
    radio.sendValue("pressure", pres)
}
function data2serial () {
    if (DEBUG == 1) {
        // adatküldés soros portra
        serial.writeValue("temp: ", temp)
        serial.writeValue("hum: ", hum)
        serial.writeValue("eCO2: ", eco2)
        serial.writeValue("light: ", bright)
        serial.writeValue("TVOC", tvoc)
        serial.writeValue("pressure", pres)
        serial.writeString("*****************")
        serial.writeLine("")
    } else if (DEBUG == 2) {
        serial.writeLine("")
        dataStreamer.writeNumberArray([
        temp,
        hum,
        eco2,
        bright,
        tvoc,
        pres
        ])
    }
}
let bright = 0
let tvoc = 0
let eco2 = 0
let temp = 0
let hum = 0
let pres = 0
let broadcast_message_delay = 0
let DEBUG = 0
let ens160_status = null
let BROADCAST = true
DEBUG = 0
let old_time = control.millis()
broadcast_message_delay = 50
let wait = 1000
// rádiócsoport beállítása
radio.setGroup(100)
// rádió teljesítmény beállítása
radio.setTransmitPower(7)
// Set sensor address
BME280.Address(BME280_I2C_ADDRESS.ADDR_0x76)
ENS160.Address(ENS160_I2C_ADDRESS.ADDR_0x52)
// soros port átirányítása usb-re
serial.redirectToUSB()
serial.setBaudRate(BaudRate.BaudRate115200)
// Save environmental data  to variables
basic.forever(function () {
    if (control.millis() - old_time > wait) {
        collect_data()
        if (BROADCAST) {
            broadcast_data()
        }
        if (DEBUG != 0) {
            data2serial()
        }
        // data2serial() // Enable to read data over serial port
        led.toggle(2, 2)
        old_time = control.millis()
    }
})
