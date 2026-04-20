import { Telegraf } from 'telegraf'
import 'dotenv/config'

type Expense = {
  name: string
  amount: number
  description: string
}

type Group = {
  users: string[]
  expenses: Expense[]
}

const token = process.env.BOT_TOKEN

if (!token) {
  throw new Error('Falta BOT_TOKEN en variables de entorno')
}

const bot = new Telegraf(token)

const groups: Record<string, Group> = {}

// ---------- helpers ----------

function calculateBalances(group: Group) {
  const total = group.expenses.reduce((acc, e) => acc + e.amount, 0)
  const perPerson = total / group.users.length

  const balances: Record<string, number> = {}

  group.users.forEach(u => balances[u] = 0)

  group.expenses.forEach(e => {
    balances[e.name] += e.amount
  })

  group.users.forEach(u => {
    balances[u] -= perPerson
  })

  return { total, perPerson, balances }
}

function settleDebts(balances: Record<string, number>) {
  const debtors: { name: string, amount: number }[] = []
  const creditors: { name: string, amount: number }[] = []

  for (const name in balances) {
    const amount = Number(balances[name].toFixed(2))

    if (amount < 0) {
      debtors.push({ name, amount: -amount })
    } else if (amount > 0) {
      creditors.push({ name, amount })
    }
  }

  const transactions: { from: string, to: string, amount: number }[] = []

  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const min = Math.min(debtors[i].amount, creditors[j].amount)

    transactions.push({
      from: debtors[i].name,
      to: creditors[j].name,
      amount: Number(min.toFixed(2))
    })

    debtors[i].amount -= min
    creditors[j].amount -= min

    if (debtors[i].amount < 0.01) i++
    if (creditors[j].amount < 0.01) j++
  }

  return transactions
}

// ---------- comandos ----------

bot.start((ctx) => {
  const chatId = String(ctx.chat.id)

  groups[chatId] = {
    users: [],
    expenses: []
  }

  ctx.reply('Grupo creado 👌\nUsá /add Nombre para agregar personas')
})

bot.command('add', (ctx) => {
  const chatId = String(ctx.chat.id)
  const name = ctx.message.text.split(' ')[1]

  if (!name) {
    return ctx.reply('Usá: /add Nombre')
  }

  if (!groups[chatId]) {
    return ctx.reply('Primero usá /start')
  }

  if (groups[chatId].users.includes(name)) {
    return ctx.reply('Ese usuario ya existe')
  }

  groups[chatId].users.push(name)

  ctx.reply(`${name} agregado 👌`)
})

bot.command('gasto', (ctx) => {
  const chatId = String(ctx.chat.id)

  if (!groups[chatId]) {
    return ctx.reply('Primero usá /start')
  }

  const [, name, amountStr, ...descArr] = ctx.message.text.split(' ')
  const amount = Number(amountStr)

  if (!name || isNaN(amount)) {
    return ctx.reply('Usá: /gasto Nombre Monto descripcion')
  }

  if (!groups[chatId].users.includes(name)) {
    return ctx.reply('Ese usuario no existe')
  }

  const description = descArr.join(' ') || ''

  groups[chatId].expenses.push({
    name,
    amount,
    description
  })

  ctx.reply(`Gasto agregado: ${name} puso $${amount}`)
})

bot.command('resumen', (ctx) => {
  const chatId = String(ctx.chat.id)
  const group = groups[chatId]

  if (!group || group.users.length === 0) {
    return ctx.reply('No hay datos')
  }

  const { total, perPerson, balances } = calculateBalances(group)
  const transactions = settleDebts(balances)

  let msg = `💸 Resumen\n\n`
  msg += `Total: $${total.toFixed(2)}\n`
  msg += `Por persona: $${perPerson.toFixed(2)}\n\n`

  msg += `Balances:\n`
  for (const name in balances) {
    const val = balances[name]

    if (val < 0) {
      msg += `- ${name} debe $${Math.abs(val).toFixed(2)}\n`
    } else {
      msg += `- ${name} recibe $${val.toFixed(2)}\n`
    }
  }

  msg += `\nPagos:\n`

  if (transactions.length === 0) {
    msg += 'Todo saldado 👌'
  } else {
    transactions.forEach(t => {
      msg += `- ${t.from} → ${t.to}: $${t.amount}\n`
    })
  }

  ctx.reply(msg)
})

bot.command('reset', (ctx) => {
  const chatId = String(ctx.chat.id)

  groups[chatId] = {
    users: [],
    expenses: []
  }

  ctx.reply('Grupo reseteado 🔄')
})

bot.command('lista', (ctx) => {
  const chatId = String(ctx.chat.id)
  const group = groups[chatId]

  if (!group) return ctx.reply('Primero usá /start')

  let msg = '👥 Personas:\n'
  group.users.forEach(u => msg += `- ${u}\n`)

  msg += '\n🧾 Gastos:\n'
  group.expenses.forEach(e => {
    msg += `- ${e.name}: $${e.amount} (${e.description})\n`
  })

  ctx.reply(msg)
})

// ---------- start ----------

bot.launch({
  dropPendingUpdates: true
})

console.log('🤖 Bot corriendo...')

// cierre limpio
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))