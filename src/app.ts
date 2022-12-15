import express from 'express'
import compression from 'compression'
import cors from 'cors'
import {nanoid} from 'nanoid'
import dotenv from 'dotenv'
import {profile, threads, tweets} from './tweets'

/* -- Environment -- */

dotenv.config()
export const isProduction = process.env.NODE_ENV === 'production'
export const DomainWhitelist = JSON.parse(process.env.DOMAIN_WHITELIST ?? '[]')
export const Port = process.env.PORT || 19999

// Add ID fields to Requests
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			requestId?: string
			sessionId?: string
		}
	}
}

/* -- App Setup -- */

const app = express()
app.use(compression())
app.disable('x-powered-by')

// Trust our proxy (our load balancer) so we can receive client IP addresses
app.set('trust proxy', 1)

// Parse JSON bodies
app.use(express.json())

// Log all requests
app.use((req, _res, next) => {
	req.requestId = nanoid(6)
	console.log(
		`[${req.requestId}]`,
		`↘ Request Received — ${req.method} ${req.path}`
	)
	next()
})

/* -- CORS -- */

// nathandavison.com/blog/be-careful-with-authenticated-cors-and-secrets-like-csrf-tokens
// stackoverflow.com/a/53953993

/* Access-Control-Allow-Origin */
app.use(cors({origin: isProduction ? DomainWhitelist : true}))

/* -- App Routes -- */

// Health check
app.get('/', (_req, res) => res.send('👍'))

// GET Profile
app.get('/profile/:twitterName', profile)

// GET Tweets
app.get('/tweets/:twitterName', tweets)

// GET Threads
app.get('/threads/:twitterName', threads)

app.listen(Port, () => console.log(`Server listening on port ${Port}`))
