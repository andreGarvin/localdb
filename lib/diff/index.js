function Object_diff(obj_1, obj_2) {

    const obj_1_keys = Object.keys(obj_1)
    const obj_2_keys = Object.keys(obj_2)
    if (obj_1_keys.length !== obj_2_keys.length ) {
        return true
    }


    for (let i in obj_1_keys) {
        if (!obj_2_keys.includes(obj_1_keys[i])) {
            return true
        }

        const obj_1_val = obj_1[obj_1_keys[i]]
        const obj_2_val = obj_2[obj_1_keys[i]]

        if (Array.isArray(obj_1_val) && Array.isArray(obj_2_val)) {
            
            const x = obj_1_val.length !== 0 ? obj_1_val : obj_2_val
            const y = obj_2_val.length !== 0 ? obj_2_val : obj_1_val
            for (let j in x) {
                if (!y.includes(x[j])) {
                    return true
                }
            }
            return false
        } else if (typeof obj_1_val === 'object' && typeof obj_2_val === 'object') {
            const diff = Object_diff(obj_1_val, obj_2_val)
            
            if (diff) {
                return true
            }
        }

        return obj_1_val === obj_2_val
    }
    return false;
}

module.exports = Object_diff