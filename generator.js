const fs = require('fs');

const confText = fs.readFileSync('config-sample.json', 'utf-8');
const conf = JSON.parse(confText);

function generateHeaderFile(conf) {
    const headerFile = fs.createWriteStream('generated/' + conf.filename + '.h');

    const includeGuard = `${conf.filename.toUpperCase()}_H_`;
    const serviceUpperName = conf.service.name.toUpperCase();
    const serviceLowerName = conf.service.name.toLowerCase();
    const base_uuid = conf.base_uuid.split('-');
    const serviceUuid = Array.from(base_uuid);
    serviceUuid[0] = conf.service.uuid;

    headerFile.write(`/**
 * @file
 * ${conf.file_header_comment}
 */

#ifndef ${includeGuard}
#define ${includeGuard}

#ifdef __cplusplus
extern "C" {
#endif // __cplusplus

#include <stdint.h>

`
    );

    headerFile.write(`
/*
 * Types
 */

`
    );

    const charCbNames = new Map();
    for (const ch of conf.characteristics) {
        const charName = `${ch.name.toLowerCase()}_cb`;
        charCbNames.set(ch.name, charName);

        headerFile.write(`/// @brief Callback type for ${ch.name} Characteristic.
// TODO: Modifying parameters
typedef int (*${charName}_t)(const uint8_t *data, uint16_t len);

`
        );
    }

    headerFile.write(`/// @brief Callback struct used by the ${serviceUpperName} Service.
struct ${serviceLowerName}_cb {
`);

    for (const cb of charCbNames.entries()) {
        headerFile.write(`    ${cb[1]}_t ${cb[1]};\n`);
    }

    headerFile.write(`};


/*
 * Functions
 */

`
    );

    headerFile.write(`/// @brief Initialize the ${serviceUpperName} Service.
int ${serviceLowerName}_init(struct ${serviceLowerName}_cb *callbacks);

`
    );

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();

        if (ch.notification) {
            const funcName = `${serviceLowerName}_send_${charName}_notify`;
            headerFile.write(`/// @brief ${funcName} sends the value by notification through ${charName} characteristic.
// TODO: Modifying parameters
int ${funcName}(const uint8_t *data, uint16_t len);

`
            );
        }
        if (ch.indication) {
            const funcName = `${serviceLowerName}_send_${charName}_indicate`;
            headerFile.write(`/// @brief ${funcName} sends the value by indication through ${charName} characteristic.
// TODO: Modifying parameters
int ${funcName}(const uint8_t *data, uint16_t len);

`
            );
        }
    }

    headerFile.write(`
#ifdef __cplusplus
}
#endif // __cplusplus

#endif // ${includeGuard}
`
    );
}

function generateSourceFile(conf) {
    const sourceFile = fs.createWriteStream('generated/' + conf.filename + '.c');

    const serviceUpperName = conf.service.name.toUpperCase();
    const serviceLowerName = conf.service.name.toLowerCase();
    const serviceUuidName = `UUID_${serviceUpperName}`;
    const base_uuid = conf.base_uuid.split('-');
    const serviceUuid = Array.from(base_uuid);
    serviceUuid[0] = conf.service.uuid;
    const cbValueName = `${serviceLowerName}_cb`;

    sourceFile.write(`/**
 * @file
 * ${conf.file_header_comment}
 */

#include <stddef.h>
#include <string.h>
#include <errno.h>

#include <zephyr/types.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/bluetooth/gatt.h>

#include "${conf.filename}.h"

LOG_MODULE_DECLARE(${conf.service.name}_Service);

/*
 * UUID
 */

/// @brief ${serviceUpperName} Service UUID
#define ${serviceUuidName}_VAL
    BT_UUID_128_ENCODE(0x${serviceUuid[0]}, 0x${serviceUuid[1]}, 0x${serviceUuid[2]}, 0x${serviceUuid[3]}, 0x${serviceUuid[4]})
#define ${serviceUuidName} BT_UUID_DECLARE_128(${serviceUuidName}_VAL)

`);

    for (const ch of conf.characteristics) {
        const charName = ch.name.toUpperCase();
        const uuid = Array.from(base_uuid);
        uuid[0] = ch.uuid;

        sourceFile.write(`/// @brief ${charName} Characteristic UUID
#define ${serviceUuidName}_${charName}_VAL
    BT_UUID_128_ENCODE(0x${uuid[0]}, 0x${uuid[1]}, 0x${uuid[2]}, 0x${uuid[3]}, 0x${uuid[4]})
#define ${serviceUuidName}_${charName} BT_UUID_DECLARE_128(${serviceUuidName}_${charName}_VAL)

`
        );
    }

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();

        if (ch.readable) {
            sourceFile.write(`
// TODO: Modify
static uint8_t ${charName}_state[1];
`
            );
        }
        if (ch.notification) {
            sourceFile.write(`static bool notify_${charName}_enabled;
`
            );
        }
        if (ch.indication) {
            sourceFile.write(`static bool indicate_${charName}_enabled;
static struct bt_gatt_indicate_params indicate_${charName}_params;
`
            );
        }
    }

    sourceFile.write(`static struct ${serviceLowerName}_cb ${cbValueName};


`
    );

    // enable notification / indication

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();

        if (ch.notification) {
            sourceFile.write(`static void ${serviceLowerName}_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    notify_${charName}_enabled = (value == BT_GATT_CCC_NOTIFY);
}

`
            );
        }
        if (ch.indication) {
            sourceFile.write(`static void ${serviceLowerName}_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    indicate_${charName}_enabled = (value == BT_GATT_CCC_INDICATE);
}

`
            );
        }
    }

    // write

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();

        if (ch.write?.enable) {
            sourceFile.write(`static ssize_t write_${charName}(
    struct bt_conn *conn,
    const struct bt_gatt_attr *attr,
    const void *buf,
    uint16_t len,
    uint16_t offset,
    uint8_t flags)
{
	LOG_DBG("Attribute write ${charName}, handle: %u, conn: %p", attr->handle, (const void *)conn);

    // TODO: check len
    if (len != 1) {
        LOG_ERR("Write ${charName}: Incorrect data length(%u)", len);
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
    }

    // TODO: check offset
     (offset != 0) {
        LOG_ERR("Write ${charName}: Incorrect data offset(%u)", offset);
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
	}

    // TODO: check buf value
    const uint8_t *data = (const uint8_t *)buf;
    if ((*data != 0x00) && (* data != 0x01)) {
        LOG_ERR("Write ${charName}: Incorrect value");
        return BT_GATT_ERR(BT_ATT_ERR_VALUE_NOT_ALLOWED);
    }

    // TODO: Modify callback
    if (${cbValueName}.${charName}_cb) {
        ${cbValueName}.${charName}_cb(data, len);
    }

    return len;
}

`
            );
        }
    }

    // read

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();
        const macroName = `CONFIG_${serviceUpperName}_POLL_${charName.toUpperCase()}`;

        if (ch.read?.enable) {
            sourceFile.write(`#ifdef ${macroName}
static ssize_t read_${charName}(
    struct bt_conn *conn,
    const struct bt_gatt_attr *attr,
    void *buf,
    uint16_t len,
    uint16_t offset)
{
    // TODO: Modify data
    const uint8_t *data = attr->user_data;

    LOG_DBG("Attribute read ${charName}, handle: %u, conn: %p", attr->handle, (const void *)conn);

    // TODO: Modify callback
    if (${cbValueName}.${charName}_cb) {
        button_state = lbs_cb.${charName}_cb(data, len);
        return bt_gatt_attr_read(
            conn, attr, buf, len, offset, data, sizeof(*data));
    }

    return 0;
}
#endif // ${macroName}

`
            );
        }
    }

    // service declaration

    sourceFile.write(`// ${serviceUpperName} Service Declaration
BT_GATT_SERVICE_DEFINE(
    ${serviceLowerName}_svc,
    BT_GATT_PRIMARY_SERVICE(${serviceUuidName}),
`
    );

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();
        const charUpperName = ch.name.toUpperCase();
        const props = [];
        const perms = [];
        if (ch.write?.enable) {
            props.push('BT_GATT_CHRC_WRITE');
            perms.push('BT_GATT_PERM_WRITE');
        }
        if (ch.read?.enable) {
            props.push('BT_GATT_CHRC_READ');
            perms.push('BT_GATT_PERM_READ');
        }
        if (ch.notification) {
            props.push('BT_GATT_CHRC_NOTIFY');
        }
        if (ch.indication) {
            props.push('BT_GATT_CHRC_INDICATE');
        }

        sourceFile.write(`
    // ${charUpperName} Characteristic
    BT_GATT_CHARACTERISTIC(
        // UUID
        ${serviceUuidName}_${charUpperName},
        // Properties
        ${props.join(' | ')},
        // Permissions
        ${perms.join(' | ')},
        // Characteristic Attribute read callback
        ${(ch.read?.enable) ? `read_${charName}` : 'NULL'},
        // Characteristic Attribute write callback
        ${(ch.write?.enable) ? `write_${charName}` : 'NULL'},
        // Characteristic Attribute user data(TODO: modify)
        ${(ch.read?.enable) ? `&${charName}_state` : 'NULL'},
    ),
`
        )
    }

    sourceFile.write(`);
`
    );

}

function main() {
    try {
        fs.mkdirSync('generated');
    } catch (e) {
        // ignore
    }

    for (const service of conf) {
        generateHeaderFile(service)
        generateSourceFile(service)
    }
}

main();
