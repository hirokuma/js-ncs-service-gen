const fs = require('fs');

const confText = fs.readFileSync('config-sample.json', 'utf-8');
const conf = JSON.parse(confText);

const serviceCbTypeName = (serviceName) => `struct ${serviceName.toLowerCase()}_cb`;
const serviceCbValueName = (serviceName) => `${serviceName.toLowerCase()}_cb`;
const charStatusTypeName = (serviceName, charName) => `struct ${serviceName.toLowerCase()}_${charName.toLowerCase()}_status`;

function generateHeaderFile(conf) {
    const headerFile = fs.createWriteStream('generated/' + conf.filename + '.h');

    const includeGuard = `${conf.filename.toUpperCase()}_H_`;
    const serviceUpper = conf.service.name.toUpperCase();
    const serviceLower = conf.service.name.toLowerCase();
    const serviceUuidName = `UUID_${serviceUpper}`;
    const serviceDefValName = `${serviceUuidName}_VAL`;
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

/*
 * UUID
 */

/// @brief ${serviceUpper} Service UUID
#define ${serviceDefValName} \\
    BT_UUID_128_ENCODE(0x${serviceUuid[0]}, 0x${serviceUuid[1]}, 0x${serviceUuid[2]}, 0x${serviceUuid[3]}, 0x${serviceUuid[4]})

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
        const charCbValue = (rw) => `${charName}_${rw}_cb`;
        const charCbType = (rw) => `${charCbValue(rw)}_t`;

        if (ch.write?.enable) {
            headerFile.write(`/// @brief Write callback type for ${charUpperName} Characteristic.
// TODO: Modifying parameters
typedef int (*${charCbType('write')})(const void *data, uint16_t len, uint16_t offset);

`
            );
            charCbNames.push(charCbValue('write'));
        }
        if (ch.read?.enable || ch.notification || ch.indication) {
            headerFile.write(`
/// @brief Read ${charUpperName} Characteristic callback data
// TODO: Modifying members
${charStatusTypeName(serviceLower, charName)} {
    // TODO: add your parameters...

    // serialized data for Read request
    uint8_t serialized[1];
};
`
            );
        }

        if (ch.read?.enable) {
            headerFile.write(`
/// @brief Read callback type for ${charUpperName} Characteristic.
// TODO: Modifying parameters
typedef int (*${charCbType('read')})(const void *data, uint16_t len, uint16_t offset, ${charStatusTypeName(serviceLower, charName)} *newState);

`
            );
            charCbNames.push(charCbValue('read'));
        }
    }

    headerFile.write(`
/// @brief Callback struct used by the ${serviceUpper} Service.
${serviceCbTypeName(serviceLower)} {
`);

    for (const cb of charCbNames) {
        headerFile.write(`    ${cb}_t ${cb};
`);
    }

    headerFile.write(`};


/*
 * Functions
 */

`
    );

    headerFile.write(`/// @brief Initialize the ${serviceUpper} Service.
int ${serviceLower}_init(${serviceCbTypeName(serviceLower)} *callbacks);

`
    );

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();

        if (ch.notification) {
            const funcName = `${serviceLower}_send_${charName}_notify`;
            headerFile.write(`/// @brief ${funcName} sends the value by notification through ${charName} characteristic.
// TODO: Modifying parameters
int ${funcName}(const uint8_t *data, uint16_t len);

`
            );
        }
        if (ch.indication) {
            const funcName = `${serviceLower}_send_${charName}_indicate`;
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

    const serviceUpper = conf.service.name.toUpperCase();
    const serviceLower = conf.service.name.toLowerCase();
    const serviceUuidName = `UUID_${serviceUpper}`;
    const serviceDefValName = `${serviceUuidName}_VAL`;
    const svcName = `${serviceLower}_svc`;
    const base_uuid = conf.base_uuid.split('-');
    const serviceUuid = Array.from(base_uuid);
    serviceUuid[0] = conf.service.uuid;
    const charCbValue = (name, rw) => `${serviceCbValueName(serviceLower)}.${name}_${rw}_cb`;
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

LOG_MODULE_REGISTER(${serviceUpper}_Service, LOG_LEVEL_INF);

/*
 * UUID
 */

#define ${serviceUuidName} BT_UUID_DECLARE_128(${serviceDefValName})

`);

    for (const ch of conf.characteristics) {
        const charUpperName = ch.name.toUpperCase();
        const uuid = Array.from(base_uuid);
        uuid[0] = ch.uuid;
        const defDecName = `${serviceUuidName}_${charUpperName}`;
        const defValName = `${defDecName}_VAL`;

        sourceFile.write(`/// @brief ${charUpperName} Characteristic UUID
#define ${defValName} \\
    BT_UUID_128_ENCODE(0x${uuid[0]}, 0x${uuid[1]}, 0x${uuid[2]}, 0x${uuid[3]}, 0x${uuid[4]})
#define ${defDecName} BT_UUID_DECLARE_128(${defValName})

`
        );
    }

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();
        const charUpperName = ch.name.toUpperCase();

        if (ch.read?.enable || ch.notification || ch.indication) {
            sourceFile.write(`
/// @brief ${charUpperName} Characteristic read status
// TODO: Modify
static ${charStatusTypeName(serviceLower, charName)} ${charStatus(charName)};
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
static struct bt_gatt_indicate_params ${charIndicateParam(charName)};`
            );
        }

        sourceFile.write('\n');
    }

    sourceFile.write(`
/// @brief service callbacks
static ${serviceCbTypeName(serviceLower)} ${serviceCbValueName(serviceLower)};


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
	LOG_DBG("Indication ${charUpperName} Characteristic %s", err != 0U ? "fail" : "success");
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
    if (offset != 0) {
        LOG_ERR("Write ${charName}: Incorrect data offset(%u)", offset);
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
	}

    // TODO: Modify callback
    if (${charCbValue(charName, 'write')}) {
        int ret = ${charCbValue(charName, 'write')}(buf, len, offset);
        if (ret != 0) {
            LOG_ERR("Write ${charName}: callback error happen: %d", ret);
            return ret;
        }
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
    LOG_DBG("Attribute read ${charName}, handle: %u, conn: %p", attr->handle, (const void *)conn);

    // TODO: Modify callback
    if (${charCbValue(charName, 'read')}) {
        int ret = ${charCbValue(charName, 'read')}(buf, len, offset, &${charStatus(charName)});
        if (ret != 0) {
            LOG_ERR("Read ${charName}: callback error happen: %d", ret);
            return (ssize_t)ret;
        }
        return bt_gatt_attr_read(
            conn, attr, buf, len, offset, &${charStatus(charName)}, sizeof(&${charStatus(charName)}));
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
    sourceFile.write(`// ${serviceUpper} Service Declaration
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
        ${(ch.read?.enable) ? `${charStatus(charName)}.serialized` : 'NULL'}
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

int ${serviceLower}_init(${serviceCbTypeName(serviceLower)} *callbacks)
{
    ${serviceCbValueName(serviceLower)} = *callbacks;
    return -ENOSYS;
}

`
    );

    for (const ch of conf.characteristics) {
        const charName = ch.name.toLowerCase();

        if (ch.notification) {
            const funcName = `${serviceLower}_send_${charName}_notify`;

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
        &${svcName}.attrs[${attributeMap.get(charName)}],
        &${charStatus(charName)}.serialized,
        sizeof(${charStatus(charName)}.serialized));
}

`
            );
        }
        if (ch.indication) {
            const funcName = `${serviceLower}_send_${charName}_indicate`;

            sourceFile.write(`/// @brief ${funcName} sends the value by indication through ${charName} characteristic.
// TODO: Modifying parameters
int ${funcName}(const uint8_t *data, uint16_t len)
{
    if (!${charIndicate(charName)}) {
        LOG_ERR("${funcName}: indicate not enabled.");
        return -EACCES;
    }

    // TODO: Modify
    ${charIndicateParam(charName)}.attr = &${svcName}.attrs[${attributeMap.get(charName)}];
    ${charIndicateParam(charName)}.func = NULL;
    ${charIndicateParam(charName)}.destroy = NULL;
    ${charIndicateParam(charName)}.data = &${charStatus(charName)}.serialized;
    ${charIndicateParam(charName)}.len = sizeof(${charStatus(charName)}.serialized);
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
