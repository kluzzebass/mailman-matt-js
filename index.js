
import fetch from 'node-fetch'
import { URL, URLSearchParams } from 'url'
import { DateTime } from 'luxon'
import ical from 'ical-generator'
import NodeCache from 'node-cache'
import express from 'express'
import cors from'cors'
import errorHandler from 'errorhandler'
import morgan from 'morgan'
import compression from 'compression'
import responseTime from 'response-time'

// Configuration things
const dev = process.env.NODE_ENV === 'development'

const port = process.env.MATT_PORT || 3000
const apiUrl = process.env.MATT_API_URL || 'https://www.posten.no/levering-av-post/_/component/main/1/leftRegion/1'
const apiTimeout = process.env.MATT_API_TIMEOUT || 3000
const domain = process.env.MATT_DOMAIN || 'example.com'
const company = process.env.MATT_COMPANY || 'Acme Inc.'
const product = process.env.MATT_PRODUCT || 'Example Product'
const summary = process.env.MATT_SUMMARY || 'POST'
const timezone = process.env.MATT_TIMEZONE || 'Europe/Oslo'
const name = process.env.MATT_NAME || 'Matt'
const cacheTTL = process.env.MATT_CACHE_TTL || 600
const cacheCheckPeriod = process.env.MATT_CACHE_CHECKPERIOD || 600
const logFormat = process.env.MATT_LOG_FORMAT || (dev ? 'dev' : 'combined')

const cache = new NodeCache({
  stdTTL: cacheTTL,
  checkperiod: cacheCheckPeriod
})

const app = express()

app.use(cors())
app.use(compression())
app.use(responseTime())
app.use(morgan(logFormat))

if (dev) {
  // only use in development
  app.use(errorHandler())
}

app.get('^/:postCode([0-9]{4})', async (req, res) => {
  doTheThing(res, req.params.postCode)
})

app.get('*', (req, res) => {
  doTheThing(res, 0)
})

app.all('*', (req, res) => {
  res.status(404)
})

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`)
})

const doTheThing = async (res, postCode) => {
  let calendar = cache.get(postCode)

  if (dev) console.log(`Post code ${postCode} ${calendar != null ? '' : 'not '}found in cache`)

  if (!calendar) {
    if (dev) console.log(`Fetching schedule for post code ${postCode}`)
    const schedule = await fetchSchedule(postCode)
    calendar = generateCalendar(schedule)
    cache.set(postCode, calendar)
  }

  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="calendar.ics"',
    'Date': DateTime.now(),
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=5',
  })

  res.send(calendar)
}

const fetchSchedule = async (postCode) => {
  try {
    let url = new URL(apiUrl)
    url.search = new URLSearchParams({ postCode }).toString();
    const res = await fetch(url, {
      'headers': {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest'
      },
      'method': 'GET',
      'timeout': apiTimeout
    })
    
    const result = await res.json()
    
    if (dev) console.log('result', result)

    const today = DateTime.now().startOf('day')

    const schedule = result.nextDeliveryDays?.reduce((agg, val) => {
      // Posten returns Norwegian dates
      if (dev) console.log(`Parsing date: ${val}`)
      let d = DateTime.fromFormat(val.match(/(\d+\.\s+\w+)$/)[0], 'd. LLLL', { locale: 'no' })
      if (dev) console.log(`Found date: ${d}`)

      if (d < today) {
        d.plus({ years: 1})
        if (dev) console.log(`Year rollover: ${d}`)
      }
      
      return agg.concat(d.toISODate())
    }, [])
    
    if (dev) console.log('schedule', schedule)
    return schedule
  } catch (err) {
    return []
  }
}

const generateCalendar = (schedule) => {
  const cal = ical({
    domain,
    prodId: {
      company,
      product
    },
    name,
    timezone,
    events: schedule.reduce((agg, val) => agg.concat({
      start: val,
      allDay: true,
      summary
    }), [])
  }).toString()

  return `${cal}\n`
}

