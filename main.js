
import {Application, Router} from "https://deno.land/x/oak/mod.ts";
import { oakCors} from "https://deno.land/x/cors/mod.ts";
import logger from "https://deno.land/x/oak_logger/mod.ts";
import iCal from 'https://jspm.dev/ical-generator';
import "https://deno.land/x/dotenv/load.ts";
import { datetime } from "https://deno.land/x/ptera/mod.ts";
import TTL from "https://deno.land/x/ttl/mod.ts";

const env = Deno.env.toObject()

// Configuration things
const dev = env.NODE_ENV === 'development'
const port = env.MATT_PORT || 3000
const apiUrl = env.MATT_API_URL || 'https://www.posten.no/levering-av-post/_/component/main/1/leftRegion/9'
const apiTimeout = env.MATT_API_TIMEOUT || 3000
const domain = env.MATT_DOMAIN || 'example.com'
const company = env.MATT_COMPANY || 'Acme Inc.'
const product = env.MATT_PRODUCT || 'Example Product'
const summary = env.MATT_SUMMARY || 'POST'
const timezone = env.MATT_TIMEZONE || 'Europe/Oslo'
const name = env.MATT_NAME || 'Matt'
const cacheTTL = env.MATT_CACHE_TTL || 600

const cache = new TTL(cacheTTL * 1000)

const doTheThing = async (response, postCode) => {
  let calendar = cache.get(postCode)

  if (!calendar) {
    if (dev) console.log(`Fetching schedule for post code ${postCode}`)
    const schedule = await fetchSchedule(postCode)
    calendar = generateCalendar(schedule)
    cache.set(postCode, calendar)
  }

  response.headers.set('Content-Type', 'text/calendar; charset=utf-8')
  response.headers.set('Content-Disposition', 'attachment; filename="calendar.ics"')
  response.headers.set('Date', Date())
  response.headers.set('Connection', 'keep-alive')
  response.headers.set('Keep-Alive', 'timeout=5')

  response.body = calendar
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

    const today = datetime().startOfDay()

    const schedule = result.nextDeliveryDays?.reduce((agg, val) => {
      // Posten returns Norwegian dates, but no year, so a bit
      // of fiddling is required to get the dates correct.
      let dt = parseDateStr(val)

      if (dt.isBefore(today)) {
        dt = dt.add({ year: 1})
        if (dev) console.log('Year rollover:', dt.toISODate())
      }

      return agg.concat(dt.toISODate())
    }, [])
    
    if (dev) console.log('Schedule:', schedule)
    return schedule
  } catch (err) {
    console.error(err)
    return []
  }
}

const monthLookup = {
  januar: 0,
  februar: 1,
  mars: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  desember: 11
}

const parseDateStr = (dateStr) => {
  const [_, day, month ] = dateStr.match(/(\d+)\.\s+(\w+)$/)
  return datetime(new Date((new Date).getFullYear(), monthLookup[month], day))
}

const generateCalendar = (schedule) => {
  const cal = iCal({
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

const router = new Router();

router.get('/:postCode([0-9]{4})', async ({response, params}) => {
  await doTheThing(response, params.postCode)
})

router.get('/', async ({response}) => {
  await doTheThing(response, 0)
})

const app = new Application();

app
  .use(logger.logger)
  .use(logger.responseTime)
  .use(oakCors({ origin: "*" }))
  .use(router.routes())
  .use(router.allowedMethods())

console.log(`Listening at http://localhost:${port}`)
await app.listen({ port })
