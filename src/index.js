import defaultRules from './Rules/Rules'

const defineReactive = (obj, key, listener) => {
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) return

  let val = obj[key]

  const getter = property && property.get
  const setter = property && property.set

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      return getter ? getter.call(obj) : val
    },
    set(newVal) {
      const value = getter ? getter.call(obj) : val
      // 值没有变，或者新旧值都为 NaN 的时候，什么都不做
      if (newVal === value || (newVal !== newVal && value !== value)) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 值变动后，自动调用监听者
      typeof listener === 'function' && listener()
      Array.isArray(listener) && listener.forEach(fn => fn)
    }
  })
}

const createLengthValidate = rule => {
  const reg = /^(m(ax|in):(\d+))(\sm(ax|in):(\d+)){0,1}$/
  const [ , , p2, p3, p4, p5, p6 ] = rule.match(reg)
  let min, max
  p2 === 'in' ? min = p3 : max = p3
  if (p4 && p2 !== p5) {
    p5 === 'ax' ? max = p6 : min = p6
  }
  if ((min && max) && (~~min > ~~max)) throw new Error('最小长度不能大于最大长度')
  return ({length}) => !((min && ~~min > length) || (max && ~~max < length))
}

export const createValidator = validator => {
  if (typeof validator === 'string') {
    if (defaultRules.rules[validator]) {
      return defaultRules.rules[validator]
    } else if (validator === 'required') {
      return val => !!val
    } else if (/^(m(ax|in):(\d+))(\sm(ax|in):(\d+)){0,1}$/.test(validator)) {
      return createLengthValidate(validator)
    } else {
      throw new Error(`您还未定义 ${validator} 这条规则`)
    }
  } else if (validator instanceof RegExp) {
    return val => validator.test(val)
  } else if (typeof validator === 'function') {
    return validator
  } else {
    throw new Error('validator 的值只能为函数或正则表达式')
  }
}

export const verifySingle = (name, value, rules) => {
  Array.isArray(rules) ? rules = [ ...rules ] : [ rules ]
  const required = rules.some(rule => rule.validator === 'required')
  for (let i = 0; i < rules.length; i++) {
    const { msg, validator } = rules[i]
    if (value === '' && !required) {
      return { name, valid: true, msg: '', validator }
    } else if (!createValidator(validator)(value)) {
      return { name, valid: false, msg: msg || '默认校验不通过消息', validator }
    }
  }
  return { name, valid: true, msg: '' }
}

export const verifyAll = (data, ruleConfig) => {
  return Object.keys(data).reduce((res, name) => (res[name] = verifySingle(name, data[name], ruleConfig[name])) && res, {})
}

export const extendRegexp = defaultRules.extendRegexp.bind(defaultRules)
export const extendValidator = defaultRules.extendValidator.bind(defaultRules)

export default class Vily {
  constructor(data, ruleConfig) {
    this.data = data
    this.ruleConfig = ruleConfig
    this.vRes = {} // 校验结果集中营
    this.initVRes()
    this.initReactive()
  }

  /**
   * 初始化校验结果
   */
  initVRes() {
    this.vRes = Object.keys(this.data).reduce((result, key) => (result[key] = {
      name: key,
      dirty: false,
      valid: true,
      msg: '',
      validator: ''
    }) && result, {})
    return this.vRes
  }

  initReactive() {
    for (let key in this.data) {
      if (this.data.hasOwnProperty(key)) {
        defineReactive(this.data, key, () => {
          const prevRes = this.vRes[key]
          let dirty = true
          // 当之前结果不脏，并且此时的值为空时，才变脏
          if (!prevRes.dirty && !this.data[key]) {
            dirty = false
          }
          const verifyResult = verifySingle(key, this.data[key], this.ruleConfig[key])
          this.vRes[key] = { ...prevRes, ...verifyResult, dirty }
        })
      }
    }
  }

  verify(name) {
    // 没有传入要校验的字段则校验整个表单
    if (!name) return this.verifyAll()
    const target = this.vRes[name]
    if (!target) return null
    return target
  }

  isError(name) {
    const verifyResult = this.verify(name)
    // 如果值没有脏，直接返回校验通过
    if (!(verifyResult || {}).dirty) return true
    return verifyResult.valid
  }

  verifyAll() {
    const res = verifyAll(this.data, this.ruleConfig)
    for (let key in res) {
      if (res.hasOwnProperty(key)) {
        if (!res[key].valid) {
          return res[key]
        }
      }
    }
    return { valid: true, msg: '' }
  }
}
