const fs = require('fs');

const confText = fs.readFileSync('config-sample.json', 'utf-8');
const conf = JSON.parse(confText);

const serviceCbTypeName = (serviceName) => `struct ${serviceName.toLowerCase()}_cb`;
const serviceCbValueName = (serviceName) => `${serviceName.toLowerCase()}_cb`;

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

    const charCbNames = [];
    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();
        const charUpperName = ch.name.toUpperCase();
        const charCbName = (rw) => `${charName}_${rw}_cb`;
        const charCbTypeName = (rw) => `${charCbName(rw)}_t`;

        if (ch.write?.enable) {
            headerFile.write(`/// @brief Write callback type for ${charUpperName} Characteristic.
// TODO: Modifying parameters
typedef int (*${charCbTypeName('write')})(const uint8_t *data, uint16_t len);

`
            );
            charCbNames.push(charCbName('write'));
        }
        if (ch.read?.enable) {
            headerFile.write(`/// @brief Read callback type for ${charUpperName} Characteristic.
// TODO: Modifying parameters
typedef int (*${charCbTypeName('read')})(const uint8_t *data, uint16_t len);

`
            );
            charCbNames.push(charCbName('read'));
        }
    }

    headerFile.write(`/// @brief Callback struct used by the ${serviceUpperName} Service.
${serviceCbTypeName(serviceLowerName)} {
`);

    for (const cb of charCbNames) {
        headerFile.write(`    ${cb}_t ${cb};\n`);
    }

    headerFile.write(`};


/*
 * Functions
 */

`
    );

    headerFile.write(`/// @brief Initialize the ${serviceUpperName} Service.
int ${serviceLowerName}_init(${serviceCbTypeName(serviceLowerName)} *callbacks);

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
    const serviceDefValName = `${serviceUuidName}_VAL`;
    const svcName = `${serviceLowerName}_svc`;
    const base_uuid = conf.base_uuid.split('-');
    const serviceUuid = Array.from(base_uuid);
    serviceUuid[0] = conf.service.uuid;
    const charCbName = (name, rw) => `${serviceCbValueName(serviceLowerName)}.${name}_${rw}_cb`;
    const charNotify = (name) => `notify_${name}_enabled`;
    const charIndicate = (name) => `indicate_${name}_enabled`;
    const charIndicateParam = (name) => `indicate_${name}_params`;
    const charStatus = (name) => `${name}_state`;
    const charRead = (name) => `read_${name}`;
    const charWrite = (name) => `write_${name}`;

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
#define ${serviceDefValName}
    BT_UUID_128_ENCODE(0x${serviceUuid[0]}, 0x${serviceUuid[1]}, 0x${serviceUuid[2]}, 0x${serviceUuid[3]}, 0x${serviceUuid[4]})
#define ${serviceUuidName} BT_UUID_DECLARE_128(${serviceDefValName})

`);

    for (const ch of conf.characteristics) {
        const charUpperName = ch.name.toUpperCase();
        const uuid = Array.from(base_uuid);
        uuid[0] = ch.uuid;
        const defDecName = `${serviceUuidName}_${charUpperName}`;
        const defValName = `${defDecName}_VAL`;

        sourceFile.write(`/// @brief ${charUpperName} Characteristic UUID
#define ${defValName}
    BT_UUID_128_ENCODE(0x${uuid[0]}, 0x${uuid[1]}, 0x${uuid[2]}, 0x${uuid[3]}, 0x${uuid[4]})
#define ${defDecName} BT_UUID_DECLARE_128(${defValName})

`
        );
    }

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();
        const charUpperName = ch.name.toUpperCase();

        if (ch.read?.enable) {
            sourceFile.write(`
/// @brief ${charUpperName} Characteristic read status
// TODO: Modify
static uint8_t ${charStatus(charName)}[1];
`
            );
        }
        if (ch.notification) {
            sourceFile.write(`/// @brief ${charUpperName} Characteristic notification flag
static bool ${charNotify(charName)};
`
            );
        }
        if (ch.indication) {
            sourceFile.write(`/// @brief ${charUpperName} Characteristic indication flag
static bool ${charIndicate(charName)};
static struct bt_gatt_indicate_params ${charIndicateParam(charName)};
`
            );
        }
    }

    sourceFile.write(`
/// @brief service callbacks
static ${serviceCbTypeName(serviceLowerName)} ${serviceCbValueName(serviceLowerName)};


`
    );

    // enable notification / indication

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();
        const charUpperName = ch.name.toUpperCase();

        if (ch.notification) {
            sourceFile.write(`/**
 * Update ${charUpperName} notification flag.
 */
static void ${charName}_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    ${charNotify(charName)} = (value == BT_GATT_CCC_NOTIFY);
}

`
            );
        }
        if (ch.indication) {
            sourceFile.write(`/**
 * Update ${charUpperName} indication flag.
 */
static void ${charName}_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    ${charIndicate(charName)} = (value == BT_GATT_CCC_INDICATE);
}

static void ${charName}_indicate_callback(struct bt_conn *conn, struct bt_gatt_indicate_params *params, uint8_t err)
{
	LOG_DBG("Indication ${charUpperName} Characteristic %s\n", err != 0U ? "fail" : "success");
}

`
            );
        }
    }

    // write

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();
        const charUpperName = ch.name.toUpperCase();

        if (ch.write?.enable) {
            sourceFile.write(`/**
 * Callback application function triggered by writing to ${charUpperName} Characteristic.
 */
static ssize_t ${charWrite(charName)}(
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
    if (${charCbName(charName, 'write')}) {
        ${charCbName(charName, 'write')}(data, len);
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
        const charUpperName = ch.name.toUpperCase();

        if (ch.read?.enable) {
            sourceFile.write(`/**
 * Callback application function triggered by reading ${charUpperName} Characteristic.
 */
static ssize_t ${charRead(charName)}(
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
    if (${charCbName(charName, 'read')}) {
        button_state = ${charCbName(charName, 'read')}(data, len);
        return bt_gatt_attr_read(
            conn, attr, buf, len, offset, data, sizeof(*data));
    }

    return 0;
}

`
            );
        }
    }

    // service declaration

    // svc.attrs[index] の値
    //      [0] Service Declaration
    //      [+1] xxx Characteristic Declaration
    //      [+1] xxx Characteristic Value
    //      [+1] CCCD
    let attributeIndex = 0;
    const attributeMap = new Map();
    sourceFile.write(`// ${serviceUpperName} Service Declaration
BT_GATT_SERVICE_DEFINE(
    ${svcName},
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
        if (perms.length === 0) {
            perms.push('BT_GATT_PERM_NONE');
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
        ${(ch.read?.enable) ? `${charRead(charName)}` : 'NULL'},
        // Characteristic Attribute write callback
        ${(ch.write?.enable) ? `${charWrite(charName)}` : 'NULL'},
        // Characteristic Attribute user data(TODO: modify)
        ${(ch.read?.enable) ? `&${charStatus(charName)}` : 'NULL'},
    ),
`
        );
        // 
        attributeIndex += 2; // Characteristic Declaration と Value

        if (ch.notification || ch.indication) {
            sourceFile.write(`
    // ${charUpperName} Client Characteristic Configuration Descriptor
    BT_GATT_CCC(
        ${charName}_ccc_cfg_changed,
        BT_GATT_PERM_READ | BT_GATT_PERM_WRITE
    ),
`
            );
            // 
            attributeMap.set(charName, attributeIndex);
            attributeIndex++;
        }
    }

    sourceFile.write(`);


/*
 * Functions
 */

int ${serviceLowerName}_init(${serviceCbTypeName(serviceLowerName)} *callbacks)
{
    ${serviceCbValueName(serviceLowerName)} = *callbacks;
    return -ENOSYS;
}

`
    );

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();

        if (ch.notification) {
            const funcName = `${serviceLowerName}_send_${charName}_notify`;

            sourceFile.write(`/// @brief ${funcName} sends the value by notification through ${charName} characteristic.
// TODO: Modifying parameters
int ${funcName}(const uint8_t *data, uint16_t len)
{
    if (!${charNotify(charName)}) {
        LOG_ERR("${funcName}: notification not enabled.");
        return -EACCES;
    }

    // TODO: Modify
    return bt_gatt_notify(
        NULL,
        &${svcName}[${attributeMap.get(charName)}],
        &${charStatus(charName)},
        sizeof(${charStatus(charName)}));
}

`
            );
        }
        if (ch.indication) {
            const funcName = `${serviceLowerName}_send_${charName}_indicate`;

            sourceFile.write(`/// @brief ${funcName} sends the value by indication through ${charName} characteristic.
// TODO: Modifying parameters
int ${funcName}(const uint8_t *data, uint16_t len)
{
    if (!${charIndicate(charName)}) {
        LOG_ERR("${funcName}: indicate not enabled.");
        return -EACCES;
    }

    // TODO: Modify
    ${charIndicateParam(charName)}.attr = ${svcName}.attrs[${attributeMap.get(charName)}];
    ${charIndicateParam(charName)}.func = ;
    ${charIndicateParam(charName)}.destroy = NULL;
    ${charIndicateParam(charName)}.data = &${charStatus(charName)};
    ${charIndicateParam(charName)}.len = sizeof(${charStatus(charName)});
    return bt_gatt_indicate(NULL, &${charIndicateParam(charName)});
}

`
            );
        }
    }

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
