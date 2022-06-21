
enum ENS160_I2C_ADDRESS {
    //% block="0x52"
    ADDR_0x52 = 0x52,
    //% block="0x53"
    ADDR_0x53 = 0x53
}

enum ENS160_OPMODES {
    //% block="Reset"
    ENS160_OPMODE_RESET = 0xF0,
    //% block="Deep sleep"
    ENS160_OPMODE_DEEP_SLEEP = 0x00,
    //% block="Idle"
    ENS160_OPMODE_IDLE = 0x01,
    //% block="Standard"
    ENS160_OPMODE_STD = 0x02
}

enum ENS160_STATUS {
    //% block="Normal"
    ENS160_STATUS_NORMAL = 0,
    //% block="Warm-Up"
    ENS160_STATUS_WARMUP = 1,
    //% block="Start-Up"
    ENS160_STATUS_INIT = 2,
    //% block="Invalid"
    ENS160_STATUS_INVALID = 3,
}

//% weight=100 color=#80c010 icon="\uf042" block="ENS160"
namespace ENS160 {
    // Default address
    let ENS160_I2C_ADDR = ENS160_I2C_ADDRESS.ADDR_0x52

    // Chip constants
    let ENS160_PARTID = 0x0160
    let ENS160_BOOTING = 10

    // ENS160 registers
    let ENS160_REG_PART_ID = 0x00
    let ENS160_REG_OPMODE = 0x10
    let ENS160_REG_CONFIG = 0x11
    let ENS160_REG_COMMAND = 0x12
    let ENS160_REG_TEMP_IN = 0x13
    let ENS160_REG_RH_IN = 0x15
    let ENS160_REG_DATA_STATUS = 0x20
    let ENS160_REG_DATA_AQI = 0x21
    let ENS160_REG_DATA_TVOC = 0x22
    let ENS160_REG_DATA_ECO2 = 0x24
    let ENS160_REG_DATA_BL = 0x28
    let ENS160_REG_DATA_T = 0x30
    let ENS160_REG_DATA_RH = 0x32
    let ENS160_REG_GPR_READ_0 = 0x48
    let ENS160_REG_GPR_READ_4 = ENS160_REG_GPR_READ_0 + 4

    // ENS160 commands
    let ENS160_COMMAND_NOP = 0x00
    let ENS160_COMMAND_CLRGPR = 0xCC
    let ENS160_COMMAND_GET_APPVER = 0x0E

    /*
     * Internal variables
     */
    let partid_ = 0
    let AQI_ = 0
    let TVOC_ = 0
    let eCO2_ = 0
    let status_ = 0
    let config_ = 0
    let fwmajor_ = 0
    let fwminor_ = 0
    let fwbuild_ = 0

    /*
     * i2c communication helpers
     */
    function setreg(reg: number, dat: number): number {
        let buf = pins.createBuffer(2)
        buf[0] = reg
        buf[1] = dat
        return pins.i2cWriteBuffer(ENS160_I2C_ADDR, buf)
    }

    function getreg(reg: number): number {
        pins.i2cWriteNumber(ENS160_I2C_ADDR, reg, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(ENS160_I2C_ADDR, NumberFormat.UInt8BE)
    }

    function getInt8LE(reg: number): number {
        pins.i2cWriteNumber(ENS160_I2C_ADDR, reg, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(ENS160_I2C_ADDR, NumberFormat.Int8LE)
    }

    function getUInt16LE(reg: number): number {
        pins.i2cWriteNumber(ENS160_I2C_ADDR, reg, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(ENS160_I2C_ADDR, NumberFormat.UInt16LE)
    }

    function getInt16LE(reg: number): number {
        pins.i2cWriteNumber(ENS160_I2C_ADDR, reg, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(ENS160_I2C_ADDR, NumberFormat.Int16LE)
    }

    function readBlock(reg: number, count: number): number[] {
        let buf: Buffer = pins.createBuffer(count)
        pins.i2cWriteNumber(ENS160_I2C_ADDR, reg, NumberFormat.UInt8BE)
        buf = pins.i2cReadBuffer(ENS160_I2C_ADDR, count)

        let tempbuf: number[] = []
        for (let i: number = 0; i < count; i++) {
            tempbuf[i] = buf[i]
        }
        return tempbuf
    }

    // ENS160 initialization
    function init(): void {
        // Reset
        setreg(ENS160_REG_OPMODE, ENS160_OPMODES.ENS160_OPMODE_RESET)
        basic.pause(ENS160_BOOTING)

        // Get part id for optional check
        partid_ = getUInt16LE(ENS160_REG_PART_ID)

        // Send commands (only works in idle mode)
        setreg(ENS160_REG_OPMODE, ENS160_OPMODES.ENS160_OPMODE_IDLE)
        basic.pause(ENS160_BOOTING)
        setreg(ENS160_REG_COMMAND, ENS160_COMMAND_NOP)
        basic.pause(ENS160_BOOTING)
        setreg(ENS160_REG_COMMAND, ENS160_COMMAND_CLRGPR)
        basic.pause(ENS160_BOOTING)

        // Query FW version
        setreg(ENS160_REG_COMMAND, ENS160_COMMAND_GET_APPVER)
        basic.pause(ENS160_BOOTING)
        let appver: number[] = readBlock(ENS160_REG_GPR_READ_4, 3)
        fwmajor_ = appver[0]
        fwminor_ = appver[1]
        fwbuild_ = appver[2]
        basic.pause(ENS160_BOOTING)

        // Set to operation
        setreg(ENS160_REG_OPMODE, ENS160_OPMODES.ENS160_OPMODE_STD)
        basic.pause(ENS160_BOOTING)

        // Get INT config (used for testing)
        config_ = getreg(ENS160_REG_CONFIG)
        basic.pause(ENS160_BOOTING)
    }

    // Get data and gpr values and store sensor status
    function get(): void {
        let st = getreg(ENS160_REG_DATA_STATUS)

        // Error
        if (st & 64) {
            status_ = ENS160_STATUS.ENS160_STATUS_INVALID
            return
        }

        // New data available
        if (st & 0x02) {
            let buf: number[] = readBlock(ENS160_REG_DATA_AQI, 7)

            AQI_ = buf[0]
            TVOC_ = (buf[2] << 8) | (buf[1])
            eCO2_ = (buf[4] << 8) | (buf[3])
        }

        // New GPR values available (not used yet)
        if (st & 0x01) {
            let buf: number[] = readBlock(ENS160_REG_GPR_READ_0, 8)
        }

        // Read baseline values (not used yet)
        if ((st & 0x01) || (st & 0x02)) {
            let buf: number[] = readBlock(ENS160_REG_DATA_BL, 8)
        }

        // Store sensor status
        status_ = (st >> 2) & 3
    }

    // Get compensation temp
    function getTemp(): number {
        let buf: number[] = readBlock(ENS160_REG_DATA_T, 2)
        let temp = (buf[1] << 8) + buf[0]
        return (temp / 64) - 273.15
    }

    // Set temp for compenstation
    function setTemp(temp: number): void {
        let temp_ = ((temp + 273.15) * 64) & 65535

        let buf = pins.createBuffer(3)
        buf[0] = ENS160_REG_TEMP_IN
        buf[1] = temp_ & 255
        buf[2] = (temp_ >> 8) & 255
        pins.i2cWriteBuffer(ENS160_I2C_ADDR, buf)
    }

    // Get compensation humidity
    function getHumidity(): number {
        let buf: number[] = readBlock(ENS160_REG_DATA_RH, 2)
        let rh = (buf[1] << 8) + buf[0]
        return rh / 512
    }

    // Set humidity for compenstation
    function setHumidity(rh: number): void {
        let rh_ = (rh * 512) & 65535

        let buf = pins.createBuffer(3)
        buf[0] = ENS160_REG_RH_IN
        buf[1] = rh_ & 255
        buf[2] = (rh_ >> 8) & 255
        pins.i2cWriteBuffer(ENS160_I2C_ADDR, buf)
    }

    /*
     * Exported functions
     */

    /**
     * get PartID
     */
    //% blockId="ENS160_GET_PARTID" block="PartID"
    //% weight=80 blockGap=8
    //% group="Sensor control"
    export function PartID(): number {
        return partid_
    }

    /**
     * get sensor status
     */
    //% blockId="ENS160_GET_STATUS" block="Status"
    //% weight=80 blockGap=8
    //% group="Sensor control"
    export function Status(): ENS160_STATUS {
        get()
        return status_
    }

    /**
     * set operating mode
     */
    //% blockId="ENS160_SET_OPMODE" block="set operating mode %opmode"
    //% weight=20 blockGap=8
    //% group="Sensor control"
    export function SetOpMode(opmode: ENS160_OPMODES) {
        setreg(ENS160_REG_OPMODE, opmode)
        basic.pause(ENS160_BOOTING)
    }

    /**
     * set I2C address of the sensor
     */
    //% blockId="ENS160_SET_ADDRESS" block="set address %addr"
    //% weight=20 blockGap=8
    //% group="Sensor control"
    export function Address(addr: ENS160_I2C_ADDRESS) {
        ENS160_I2C_ADDR = addr
        init()
    }

    /**
     * get TVOC
     */
    //% blockId="ENS160_GET_TVOC" block="TVOC"
    //% weight=80 blockGap=8
    //% group="Sensor values"
    export function TVOC(): number {
        get()
        return TVOC_
    }

    /**
     * get eCO2
     */
    //% blockId="ENS160_GET_ECO2" block="eCO2"
    //% weight=80 blockGap=8
    //% group="Sensor values"
    export function eCO2(): number {
        get()
        return eCO2_
    }

    /**
     * get AQI
     */
    //% blockId="ENS160_GET_AQI" block="AQI"
    //% weight=80 blockGap=8
    //% group="Sensor values"
    export function AQI(): number {
        get()
        return AQI_
    }

    /**
     * get compensation temperature
     */
    //% blockId="ENS160_GET_GETTEMP" block="Temp"
    //% weight=30 blockGap=8 advanced=true
    //% group="Environment compensation"
    export function Temp(): number {
        return getTemp()
    }

    /**
     * get compensation humidity
     */
    //% blockId="ENS160_GET_GETRH" block="Humidity"
    //% weight=30 blockGap=8 advanced=true
    //% group="Environment compensation"
    export function Humidity(): number {
        return getHumidity()
    }

    /**
     * set compensation temperature
     */
    //% blockId="ENS160_GET_SETTEMP" block="set temp %temp"
    //% weight=20 blockGap=8 advanced=true
    //% group="Environment compensation"
    export function SetTemp(temp: number): void {
        setTemp(temp)
    }

    /**
     * set compensation humidity
     */
    //% blockId="ENS160_GET_SETRH" block="set humidity %rh"
    //% weight=20 blockGap=8 advanced=true
    //% group="Environment compensation"
    export function SetHumidity(rh: number): void {
        setHumidity(rh)
    }

    /**
     * get FW major
     */
    //% blockId="ENS160_GET_FWMAJOR" block="FW major version"
    //% weight=12 blockGap=8 advanced=true
    //% group="Firmware version"
    export function FwMajor(): number {
        return fwmajor_
    }

    /**
     * get FW minor
     */
    //% blockId="ENS160_GET_FWMINOR" block="FW minor version"
    //% weight=11 blockGap=8 advanced=true
    //% group="Firmware version"
    export function FwMinor(): number {
        return fwminor_
    }

    /**
     * get FW build
     */
    //% blockId="ENS160_GET_FWBUILD" block="FW build number"
    //% weight=10 blockGap=8 advanced=true
    //% group="Firmware version"
    export function FwBuild(): number {
        return fwbuild_
    }
}