import {Request, Response} from 'express'
import {Profile, Scraper, Tweet} from '@the-convocation/twitter-scraper'
import _ from 'lodash'

/* --- Cache --- */

type UserCache<T> = {[key: string]: UserCacheRecord<T>}
type UserCacheRecord<T> = {items: T; timestamp: number}

const UserTweetCache: UserCache<Tweet[]> = {}
const UserThreadCache: UserCache<Tweet[][]> = {}
const UserProfileCache: UserCache<Profile> = {}

/** Checks if a cache is stale (>1 week old) */
const isCacheStale = <T>(
	cache: UserCacheRecord<T>,
	threshold: '24h' | '7d' = '7d'
) => {
	const now = performance.now()
	const cacheAge = now - cache.timestamp
	return cacheAge > 1000 * 60 * 60 * 24 * (threshold === '7d' ? 7 : 1)
}

/* --- Routes --- */

export const profile = async (req: Request, res: Response) => {
	// Get Twitter name
	const {twitterName} = req.params

	// Check cache
	const cache = UserProfileCache[twitterName]
	if (cache && !isCacheStale(cache, '24h')) {
		return res.send({cache: true, profile: cache.items})
	}

	// Get the profile for the user
	const scraper = new Scraper()
	const profile = await scraper.getProfile(twitterName)

	// Cache the profile
	UserProfileCache[twitterName] = {
		items: profile,
		timestamp: performance.now()
	}

	// Return the profile as a JSON object
	res.send({cache: false, profile})
}

export const tweets = async (req: Request, res: Response) => {
	// Get Twitter name
	const {twitterName} = req.params

	// Check cache
	const cache = UserTweetCache[twitterName]
	if (cache && !isCacheStale(cache)) {
		return res.send({cache: true, tweets: cache.items})
	}

	// Get the tweets for the user
	const tweets = await getTweetsForUser(twitterName)

	// Cache the tweets
	UserTweetCache[twitterName] = {
		items: tweets,
		timestamp: performance.now()
	}

	// Return the tweets as a JSON array
	res.send({cache: false, tweets})
}

export const threads = async (req: Request, res: Response) => {
	// Get Twitter name
	const {twitterName} = req.params

	// Check cache
	const cache = UserThreadCache[twitterName]
	if (cache && !isCacheStale(cache)) {
		return res.send({cache: true, threads: cache.items})
	}

	// Get the tweets for the user
	const tweets = await getTweetsForUser(twitterName)

	// Get threads
	const threads = getThreadsFromTweets(tweets, twitterName)

	// Cache the threads
	UserThreadCache[twitterName] = {
		items: threads,
		timestamp: performance.now()
	}

	// Return the threads as a JSON array
	res.send({cache: false, threads})
}

/* --- Helpers --- */

const getTweetsForUser = async (twitterName: string) => {
	const scraper = new Scraper()
	const tweetGenerator = scraper.getTweets(twitterName, 200, true)
	const tweetResults = await Promise.all(_.times(200, tweetGenerator.next))
	const tweets = tweetResults
		.map((tweetResult) => tweetResult.value)
		.filter((tweet) => tweet && !tweet.isReteweet)
	return tweets
}

/** Extracts threads by a user from a set of Tweets */
const getThreadsFromTweets = (
	tweets: Tweet[],
	twitterName: string
): Tweet[][] => {
	const threads: Tweet[][] = []

	// Get all reply tweets
	const replyTweets = tweets.filter((tweet) => tweet.inReplyToStatus)

	// Rebuild threads from reply tweets
	replyTweets.forEach((replyTweet) => {
		// Get the thread for this reply tweet
		const thread = rebuildThreadFromTweet(replyTweet, twitterName)
		if (!thread) return

		// Make sure the thread is not already in the threads array
		const threadAlreadyExists = threads.some((existingThread) => {
			return existingThread[0].id === thread[0].id
		})
		if (threadAlreadyExists) return

		// Add the thread to the threads array
		threads.push(thread)
	})

	return threads
}

const rebuildThreadFromTweet = (
	tweet: Tweet,
	twitterName: string
): Tweet[] | undefined => {
	const thread: Tweet[] = [tweet]
	let currentTweet = tweet

	// Recursively add in-reply-to-tweets to the thread
	while (currentTweet.inReplyToStatus) {
		// Add the in-reply-to-tweet to the thread
		const inReplyToTweet = currentTweet.inReplyToStatus
		thread.push(inReplyToTweet)

		// Set the current tweet to the in-reply-to-tweet
		currentTweet = inReplyToTweet
	}

	// Trim tweets at start that are not by the user
	while (thread.length > 0 && thread[0].username !== twitterName) {
		thread.shift()
	}

	// Trim tweets at end that are not by the user
	while (
		thread.length > 0 &&
		thread[thread.length - 1].username !== twitterName
	) {
		thread.pop()
	}

	// Return empty if thread has only one tweet after trimming
	if (thread.length < 2) return undefined

	// Reverse & return the thread
	return thread.reverse()
}
