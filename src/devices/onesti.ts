import {Definition, Fz} from '../lib/types';
import * as exposes from '../lib/exposes';
import fz from '../converters/fromZigbee';
import tz from '../converters/toZigbee';
import * as reporting from '../lib/reporting';
const e = exposes.presets;
const ea = exposes.access;
import {KeyValue} from 'zigbee-herdsman/dist/controller/tstype';

const fzLocal = {
    nimly_pro_lock_actions: {
        cluster: 'closuresDoorLock',
        type: ['attributeReport', 'readResponse'],
        convert: (model: Definition, msg: Fz.Message) => {
            const result: KeyValue = {};
            const attributes: KeyValue = {};
            // Handle attribute 257
            if (msg.data['257'] !== undefined) {
                const buffer = Buffer.from(msg.data['257']);
                let pincode = '';
                for (const byte of buffer) {
                    pincode += byte.toString(16);
                }
                attributes.last_used_pincode = pincode;
            }

            // Handle attribute 256
            if (msg.data['256'] !== undefined) {
                const hex = msg.data['256'].toString(16).padStart(8, '0');
                const firstOctet = String(hex.substring(0, 2));
                const lookup: { [key: string]: string } = {
                    '00': 'MQTT',
                    '02': 'Keypad',
                    '03': 'Fingerprint',
                    '04': 'RFID',
                    '0a': 'Self',
                };
                result.last_action_source = lookup[firstOctet]||'Unknown';
                const secondOctet = hex.substring(2, 4);
                const thirdOctet = hex.substring(4, 8);
                result.last_action_user = parseInt(thirdOctet, 16);
                if (secondOctet == '01') {
                    attributes.last_lock_user = result.last_action_user;
                    attributes.last_lock_source = result.last_action_source;
                } else if (secondOctet == '02') {
                    attributes.last_unlock_user = result.last_action_user;
                    attributes.last_unlock_source = result.last_action_source;
                }
            }

            // Return result if not empty
            if (Object.keys(attributes).length > 0) {
                return attributes;
            }
        },
    },
};


const definitions: Definition[] = [
    {
        zigbeeModel: ['easyCodeTouch_v1', 'EasyCodeTouch', 'EasyFingerTouch', 'NimlyPRO', 'NimlyCode'],
        model: 'easyCodeTouch_v1',
        vendor: 'Onesti Products AS',
        description: 'Zigbee module for EasyAccess code touch series',
        // eslint-disable-next-line max-len
        fromZigbee: [fzLocal.nimly_pro_lock_actions, fz.lock, fz.lock_operation_event, fz.battery, fz.lock_programming_event, fz.easycodetouch_action],
        toZigbee: [tz.lock, tz.easycode_auto_relock, tz.lock_sound_volume, tz.pincode_lock],
        meta: {pinCodeCount: 50},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(11);
            await reporting.bind(endpoint, coordinatorEndpoint, ['closuresDoorLock', 'genPowerCfg']);
            await reporting.lockState(endpoint);
            await reporting.batteryPercentageRemaining(endpoint);
            await endpoint.read('closuresDoorLock', ['lockState', 'soundVolume']);
            device.powerSource = 'Battery';
            device.save();
        },
        exposes: [e.lock(), e.battery(), e.sound_volume(),
            e.text('last_unlock_source', ea.STATE).withDescription('Last unlock source'),
            e.text('last_unlock_user', ea.STATE).withDescription('Last unlock user'),
            e.text('last_lock_source', ea.STATE).withDescription('Last lock source'),
            e.text('last_lock_user', ea.STATE).withDescription('Last lock user'),
            e.text('last_used_pin_code', ea.STATE).withDescription('Last used pin code'),
            e.binary('auto_relock', ea.STATE_SET, true, false).withDescription('Auto relock after 7 seconds.'),
        ],
    },
    {
        zigbeeModel: ['S4RX-110'],
        model: 'S4RX-110',
        vendor: 'Onesti Products AS',
        description: 'Relax smart plug',
        fromZigbee: [fz.on_off, fz.electrical_measurement, fz.metering, fz.device_temperature, fz.identify],
        toZigbee: [tz.on_off],
        exposes: [e.switch(), e.power(), e.current(), e.voltage(), e.energy(), e.device_temperature()],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(2);
            await reporting.bind(endpoint, coordinatorEndpoint, ['genIdentify', 'genOnOff', 'genDeviceTempCfg',
                'haElectricalMeasurement', 'seMetering']);
            await reporting.onOff(endpoint);
            await reporting.readEletricalMeasurementMultiplierDivisors(endpoint);
            await reporting.activePower(endpoint);
            await reporting.rmsCurrent(endpoint);
            await reporting.rmsVoltage(endpoint);
            await reporting.readMeteringMultiplierDivisor(endpoint);
            await reporting.currentSummDelivered(endpoint);
            await reporting.deviceTemperature(endpoint);
        },
        endpoint: (device) => {
            return {default: 2};
        },
    },
];

module.exports = definitions;
