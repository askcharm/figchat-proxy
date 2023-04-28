import express from 'express'
import compression from 'compression'
import dotenv from 'dotenv'
import {Client, HUMAN_PROMPT} from '@anthropic-ai/sdk'
import _ from 'lodash'

/* -- Environment -- */

dotenv.config()
export const Port = process.env.PORT || 5555

/* -- App Setup -- */

const app = express()
app.use(compression())
app.disable('x-powered-by')
app.use(express.json())

/* -- App Routes -- */

// Health Check
app.get('/', (_req, res) => res.send('👍'))

// Anthropic Streaming Proxy
app.post('/v1/complete', (req, res) => {
	res.setHeader('Cache-Control', 'no-cache')
	res.setHeader('Content-Type', 'text/event-stream')
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Connection', 'keep-alive')
	res.flushHeaders() // flush the headers to establish SSE with client

	// Extract request parameters
	const {'x-api-key': apiKey} = req.headers
	const {
		prompt,
		model,
		max_tokens_to_sample = 3000,
		stop_sequences = [HUMAN_PROMPT],
		temperature = 1,
		top_p = -1,
		stream = true
	} = req.body as {
		prompt: string
		model: 'claude-v1' | 'claude-instant-v1'
		stop_sequences: string[]
		max_tokens_to_sample?: number
		temperature?: number
		top_p?: number
		stream?: boolean
	}

	// Validate request parameters
	if (
		!_.isString(apiKey) ||
		!_.isString(prompt) ||
		!_.isArray(stop_sequences) ||
		!_.isString(model) ||
		!stream ||
		!_.isNumber(max_tokens_to_sample) ||
		!_.isNumber(temperature) ||
		!_.isNumber(top_p)
	) {
		res.write('data: Invalid Request\n\n')
		res.end()
		return
	}

	// Create a new client
	const client = new Client(apiKey)

	// Run completion
	client
		.completeStream(
			{
				prompt,
				stop_sequences,
				max_tokens_to_sample,
				model,
				temperature,
				top_p
			},
			{
				onUpdate: async (completion) => {
					// Send completion via SSE
					res.write(`data: ${JSON.stringify(completion)}\n\n`)
				}
			}
		)
		.then(() => {
			// Close SSE connection
			res.write(`data: [DONE]\n\n`)
			res.end()
		})
		.catch(() => {
			// Close SSE connection
			res.end()
		})
})

app.listen(Port, () =>
	// eslint-disable-next-line no-console
	console.log(`Server listening on port ${process.env.PORT || 5555}`)
)
