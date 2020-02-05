const input = document.querySelector("input")
const output = document.querySelector("output")
document.onload = () => input.focus()

const keydown = async function*() {
  let send = event => void event
  const event = () => new Promise(resolve => (send = resolve))
  document.onkeydown = event => send(event)

  while (true) {
    const key = await event()

    yield key
  }
}

const readWhiteSpace = (input, offset, toknes) => {
  while (offset < input.length) {
    const char = input.charAt(offset)
    if (char === " ") {
      offset++
    } else {
      break
    }
  }
  return offset
}

const readToken = (input, offset, tokens) => {
  let position = offset
  while (position < input.length) {
    const char = input.charAt(position)
    if (char === " ") {
      break
    } else {
      position++
    }
  }
  tokens.push(input.slice(offset, position))
  return position
}

const readString = (quote, input, start, tokens) => {
  let end = start + 1
  let token = ""
  while (end < input.length) {
    const char = input.charAt(end)
    switch (char) {
      case quote: {
        end++
        tokens.push(token)
        return end
      }
      case `\\`: {
        token += char
        end++
        token += input.charAt(end)
        end++
        break
      }
      default: {
        token += char
        end++
      }
    }
  }
  throw RangeError(`String was not quoted properly: ${input.slice(start, end)}`)
}

const tokenize = input => {
  const source = input.trim()
  const tokens = []
  let offset = 0
  const size = source.length
  while (offset < size) {
    const char = input.charAt(offset)
    switch (char) {
      case `'`:
      case `"`: {
        offset = readString(char, input, offset, tokens)
        break
      }
      case ` `: {
        offset = readWhiteSpace(input, offset, tokens)
        break
      }
      default: {
        offset = readToken(input, offset, tokens)
      }
    }
  }
  return tokens
}

const parseCommand = input => {
  const params = []
  const options = Object.create(null)
  const tokens = tokenize(input)

  let index = 0
  while (index < tokens.length) {
    const token = tokens[index++]
    if (token.startsWith("--")) {
      const name = token.slice(2)
      const value = tokens[index]
      if (index == tokens.length || value.startsWith("--")) {
        options[name] = true
      } else {
        try {
          options[name] = JSON.parse(value)
        } catch (_) {
          options[name] = value
        }
      }
    } else {
      params.push(token)
    }
  }
  return [...params, options]
}

const serializeCommand = (command, params) => {
  let tokens = [command]
  for (const [key, value] of Object.entries(params)) {
    tokens.push(`--${key}`)
    if (value !== true) {
      tokens.push(String(value))
    }
  }
  return tokens.join(" ")
}

const execute = async state => {
  const { value } = input
  const inn = document.createElement("code")
  inn.classList.add("inn")
  inn.textContent = value
  const out = document.createElement("code")
  out.classList.add("out")
  out.textContent = ""

  output.appendChild(inn)
  output.appendChild(out)
  input.value = ""

  try {
    const [name, ...args] = parseCommand(value)
    const command = commands[name]
    out.innerHTML =
      commands[name] != null
        ? await commands[name](...args)
        : await commands.help(name, ...args)
  } catch (error) {
    out.textContent = error.toString()
    out.classList.add("error")
  }
}

class Model {
  constructor() {
    this.history = []
    this.offset = 0
    this.files = Object.create(null)
    this.id = 0
    this.volume = null
  }
  selectPrevious() {
    this.offset = Math.min(this.offset + 1, this.history.length)
    return this.selected()
  }
  selectNext() {
    this.offset = Math.max(this.offset - 1, 0)
    return this.selected()
  }
  selected() {
    return this.history[this.history.length - this.offset]
  }
  addEntry(input) {
    this.history.push(input)
    this.offset = 0
    return this
  }
}

const main = async () => {
  const state = new Model()
  for await (const event of keydown()) {
    switch (event.key) {
      case "Enter": {
        event.preventDefault()
        if (event.shiftKey) {
          state.addEntry(input.value)
          input.value = ""
        } else {
          execute(state.addEntry(input.value))
        }
        break
      }
      case "ArrowUp": {
        event.preventDefault()
        const entry = state.selectPrevious()
        if (entry) {
          input.value = entry
          input.setSelectionRange(entry.length, entry.length)
        }
        break
      }
      case "ArrowDown": {
        event.preventDefault()
        const entry = state.selectNext()
        if (entry) {
          input.value = entry
          input.setSelectionRange(entry.length, entry.length)
        }
        break
      }
      default: {
        console.log(event)
      }
    }
  }
}

const commands = new (class {
  constructor() {
    this.workURL = new URL(location.origin)
  }
  pwd() {
    return this.workURL.pathname
  }
  cd(path) {
    const workURL = new URL(path, this.workURL)
    this.workURL = workURL.pathname.endsWith("/")
      ? workURL
      : new URL(`${workURL.href}/`)
    return this.pwd()
  }
  resolve(path) {
    return new URL(path, this.workURL).pathname
  }
  async ls(input = "") {
    const path = this.resolve(typeof input === "object" ? "" : input)
    const request = await fetch(`${path}`, { method: "LIST" })
    if (request.ok) {
      const entries = await request.json()
      const list = entries.map(entry => {
        return `<li class="${entry.type} ${entry.open ? "open" : "closed"}">${
          entry.path
        }</li>`
      })
      return `<strong>Listing ${path}</strong><br/><ul>${list.join("\n")}</ul>`
    } else {
      throw Error(await request.text())
    }
  }
  async stat(input = "") {
    const path = this.resolve(typeof input === "object" ? "" : input)
    const request = await fetch(`${path}`, { method: "INFO" })
    if (request.ok) {
      const info = await request.json()
      return `<strong>Stat ${path}</strong><br/><pre>${JSON.stringify(
        info,
        null,
        2
      )}</pre>`
    } else {
      throw Error(await request.text())
    }
  }
  async open(path, params) {
    const searchParams = new URLSearchParams(params)
    const request = await fetch(`${this.resolve(path)}?${searchParams}`, {
      method: "OPEN"
    })
  }
  async read(path, params) {
    const searchParams = new URLSearchParams(params)
    const request = await fetch(`${this.resolve(path)}?${searchParams}`, {
      method: "GET"
    })
    if (request.ok) {
      return `<strong>File ${path}</strong><br/><pre>${await request.text()}</pre>`
    } else {
      throw Error(await request.text())
    }
  }
  async cat(path) {
    return this.read(path, {})
  }
  async write(path, content, params) {
    const searchParams = new URLSearchParams(params)
    const request = await fetch(`${this.resolve(path)}?${searchParams}`, {
      method: "PUT",
      body: content
    })
    if (request.ok) {
      return `<strong>Wrote ${path}</strong>`
    } else {
      throw Error(await request.text())
    }
  }
  async rm(path, params) {
    const searchParams = new URLSearchParams(params)
    const request = await fetch(`${this.resolve(path)}?${searchParams}`, {
      method: "DELETE"
    })
    if (request.ok) {
      return `<strong>Deleted ${path}</strong>`
    } else {
      throw Error(await request.text())
    }
  }
  help(input) {
    let result =
      typeof input === "string"
        ? `command <strong>${input}</strong> not found.<br/>`
        : ""
    const commands = new Set(
      Object.getOwnPropertyNames(this.constructor.prototype)
    )
    commands.delete("constructor")
    return `${result}I know commands: <br/>${[...commands].join("<br/>  ")}`
  }
})()

main()
