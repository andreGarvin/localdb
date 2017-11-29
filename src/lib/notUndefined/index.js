module.exports = (inp) => {
    if (inp !== undefined) {
        return true
    } else {
        if (inp === undefined) {
            return false;
        }
        
        else if (typeof inp !== 'object') {
            return inp === undefined
        } else if (Array.isArray(inp)) {
            return inp.filter(i => i === undefined)[0] === undefined
        }

        for (let i in inp) {
            if (inp[i] === undefined) {
                return false
            }
        }
        return true
    }
}