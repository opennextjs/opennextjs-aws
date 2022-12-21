import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { IncomingMessage, ServerResponse } from 'http'
import { defaultConfig, NextConfigComplete } from 'next/dist/server/config-shared'
import { imageOptimizer as nextImageOptimizer, ImageOptimizerCache } from 'next/dist/server/image-optimizer'
import { NextUrlWithParsedQuery } from 'next/dist/server/request-meta'
import { ImageConfigComplete } from 'next/dist/shared/lib/image-config'
import { Readable } from 'stream'

const bucketName = process.env.BUCKET_NAME;
const nextDir = path.join(__dirname, ".next");
const { config } = loadConfig();
console.log("Init config", {
	nextDir,
	bucketName,
	defaultConfig,
	imagesConfig: config.images,
});

const pipeRes = (w, res) => {
  w.pipe(res)
    .once('close', () => {
      res.statusCode = 200
      res.end()
    })
    .once('error', (err) => {
      console.error('Failed to get image', { err })
      res.statusCode = 400
      res.end()
    })
}

// Handle fetching of S3 object before optimization happens in nextjs.
let downloadError = null;
const downloader = async (req, res, url) => {
	if (!url) {
		throw new Error('URL is missing from request.')
	}

	console.log("downloader url", url);

	try {
		const urlLower = url.href.toLowerCase();
		if (urlLower.startsWith("http://") || urlLower.startsWith("https://")) {
			pipeRes(https.get(url), res)
		} else {
			// S3 expects keys without leading `/`
			const trimmedKey = url.href.startsWith('/') ? url.href.substring(1) : url.href

			const client = new S3Client({})
			const response = await client.send(new GetObjectCommand({
				Bucket: bucketName,
				Key: trimmedKey,
			}));

			pipeRes(response.Body, res);

			if (response.ContentType) {
				res.setHeader('Content-Type', response.ContentType)
			}

			if (response.CacheControl) {
				res.setHeader('Cache-Control', response.CacheControl)
			}
		}
	} catch(e) {
		console.error("Failed to download image", e)
		downloadError = e;
		throw e;
	}
}

// Make header keys lowercase to ensure integrity.
const normalizeHeaders = (headers) =>
	Object.entries(headers).reduce((acc, [key, value]) =>
    ({ ...acc, [key.toLowerCase()]: value }),
    {}
  )

function loadConfig() {
  const requiredServerFilesPath = path.join(nextDir, 'required-server-files.json');
  const json = fs.readFileSync(requiredServerFilesPath, 'utf-8');
  return JSON.parse(json);
}

const nextConfig = {
	...(defaultConfig),
	images: {
		...(defaultConfig.images),
		...config.images,
	},
}

// We don't need serverless-http neither basePath configuration as endpoint works as single route API.
// Images are handled via header and query param information.
export async function handler(event) {
  console.log("handler event", event)

	// Clear downloader error
	downloadError = null;

	try {
		if (!bucketName) {
			throw new Error('Bucket name must be defined!')
		}

		// Validate params
		// ie. checks if external image URL matches the `images.remotePatterns`
		const imageParams = ImageOptimizerCache.validateParams(
			{ headers: event.headers },
			event.queryStringParameters,
			nextConfig,
			false
		);

		console.log("image params", imageParams);

		if ('errorMessage' in imageParams) {
			throw new Error(imageParams.errorMessage)
		}

		// Optimize image
		const optimizedResult = await nextImageOptimizer(
			{ headers: normalizeHeaders(event.headers) },
			{}, // res object is not necessary as it's not actually used.
			imageParams,
			nextConfig,
			false, // not in dev mode
			downloader,
		)

		console.log("optimized result", optimizedResult);

		return {
			statusCode: 200,
			body: optimizedResult.buffer.toString("base64"),
			isBase64Encoded: true,
			headers: {
				Vary: "Accept",
				"Cache-Control": `public,max-age=${optimizedResult.maxAge},immutable`,
				"Content-Type": optimizedResult.contentType,
			},
		}
	} catch(e) {
    console.error(e)
    return {
      statusCode: 500,
      headers: {
        Vary: 'Accept',
        // For failed images, allow client to retry after 1 minute. 
        'Cache-Control': `public,max-age=60,immutable`,
        'Content-Type': 'application/json'
      },
      body: [
				`Response Error: ${e?.message || e?.toString() || e}`,
				...(downloadError
					? [`Download Error: ${downloadError?.message || downloadError?.toString() || downloadError}`]
					: []),
			].join("\n")
    }
	}
}