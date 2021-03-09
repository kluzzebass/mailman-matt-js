
import fetch from 'node-fetch'
import { URL, URLSearchParams } from 'url';
import moment from 'moment'
import ical from 'ical-generator'
import NodeCache from 'node-cache'

import express from 'express'
import cors from'cors'
import errorHandler from 'errorhandler'
import morgan from 'morgan'
import compression from 'compression'
import responseTime from 'response-time'

// Configuration things
const port = process.env.MATT_PORT || 3000
const apiUrl = process.env.MATT_API_URL || 'https://www.posten.no/levering-av-post-2020/_/component/main/1/leftRegion/1'
const apiTimeout = process.env.MATT_API_TIMEOUT || 3000
const domain = process.env.MATT_DOMAIN || 'example.com'
const company = process.env.MATT_COMPANY || 'Acme Inc.'
const product = process.env.MATT_PRODUCT || 'Example Product'
const summary = process.env.MATT_SUMMARY || 'POST'
const name = process.env.MATT_NAME || 'Matt'
const cacheTTL = process.env.MATT_CACHE_TTL || 600
const cacheCheckPeriod = process.env.MATT_CACHE_CHECKPERIOD || 600


const cache = new NodeCache({
  stdTTL: cacheTTL,
  checkperiod: cacheCheckPeriod
})

const app = express()

app.use(cors())
app.use(compression())
app.use(responseTime())

if (process.env.NODE_ENV === 'development') {
  // only use in development
  app.use(morgan('dev'))
  app.use(errorHandler())
} else {
  app.use(morgan('combined'))
}


// Posten returns Norwegian dates
moment.locale('nb')

app.get('^/:postCode([0-9]{4})', async (req, res) => {
  doTheThing(res, req.params.postCode)
})

app.get('*', (req, res) => {
  doTheThing(res, 0)
})

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`)
})


const doTheThing = async (res, postCode) => {
  let schedule = cache.get(postCode)
  console.log(`${postCode} in cache: ${schedule != null}`)
  if (!schedule) {
    schedule = await fetchSchedule(postCode)
    cache.set(postCode, schedule)
  }
  const calendar = generateCalendar(schedule)

  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="calendar.ics"',
    'Date': moment(),
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
    
    const today = moment();
    const schedule = result.nextDeliveryDays?.reduce((agg, val) => {
      let d = moment(val.match(/(\d+\.\s+\w+)$/)[0], 'D. MMMM')
      if (d < today) d.add(1, 'y')
      
      agg.push(d)
      return agg
    }, [])
    
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
    events: schedule.reduce((agg, val) => {
      const ev = {
          start: val,
          allDay: true,
          summary,
          timezone: 'Europe/Oslo'
      }
      agg.push(ev)
      return agg
    }, [])
  }).toString()

  return `${cal}\n`
}

