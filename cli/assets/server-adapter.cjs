import fs from "node:fs";
import path from "node:path";
import slsHttp from 'serverless-http'
import NextServer from "next/dist/server/next-server";

const nextDir = path.join(__dirname, ".next");
console.log({ nextDir });

function convertApigRequestToNext(event) {
  let host = event.headers["x-forwarded-host"] || event.headers.host;
  let search = event.rawQueryString.length ? `?${event.rawQueryString}` : "";
  let scheme = "https";
  let url = new URL(event.rawPath + search, `${scheme}://${host}`);
  let isFormData = event.headers["content-type"]?.includes(
    "multipart/form-data"
  );

  // Build headers
  const headers = new Headers();
  for (let [header, value] of Object.entries(event.headers)) {
    if (value) {
      headers.append(header, value);
    }
  }

  return new Request(url.href, {
    method: event.requestContext.http.method,
    headers,
    body:
      event.body && event.isBase64Encoded
        ? isFormData
          ? Buffer.from(event.body, "base64")
          : Buffer.from(event.body, "base64").toString()
        : event.body,
  });
}

async function convertNextResponseToApig(response) {
  // Build cookies
  // note: AWS API Gateway will send back set-cookies outside of response headers.
  const cookies = [];
  for (let [key, values] of Object.entries(response.headers.raw())) {
    if (key.toLowerCase() === "set-cookie") {
      for (let value of values) {
        cookies.push(value);
      }
    }
  }

  if (cookies.length) {
    response.headers.delete("Set-Cookie");
  }

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    cookies,
    body: await response.text(),
  };
}

function loadConfig() {
  const requiredServerFilesPath = path.join(nextDir, 'required-server-files.json');
  const json = fs.readFileSync(requiredServerFilesPath, 'utf-8');
  const requiredServerFiles = JSON.parse(json);
  return {
    // hostname and port must be defined for proxying to work (middleware)
    //hostname: 'localhost',
    //port: Number(process.env.PORT) || 3000,
    // Next.js compression should be disabled because of a bug
    // in the bundled `compression` package. See:
    // https://github.com/vercel/next.js/issues/11669
    conf: { ...requiredServerFiles.config, compress: false },
    customServer: false,
    dev: false,
    dir: __dirname,
    minimalMode: true, // turning this on breaks middleware
    // "minimalMode" controls:
    //  - Rewrites and redirects
    //  - Headers
    //  - Middleware
    //  - SSG cache
  };
}

const config = loadConfig();
const requestHandler = new NextServer(config).getRequestHandler();

const server = slsHttp(
	async (req, res) => {
		await requestHandler(req, res).catch((e) => {
			// Log into Cloudwatch for easier debugging.
			console.error(`NextJS request failed due to:`)
			console.error(e)

			res.setHeader('Content-Type', 'application/json')
			res.end(JSON.stringify(getErrMessage(e), null, 3))
		})
	},
	{
		// We have separate function for handling images. Assets are handled by S3.
    binary: true,
		provider: 'aws',
		basePath: process.env.NEXTJS_LAMBDA_BASE_PATH,
	},
);

//export const handler = server;

export const handler = async (event) => {
  console.log(event)
  console.log(event.rawPath)

  const response = await server(event);

  // Handle cache response headers not set for HTML pages
  const htmlPages = loadHtmlPages();
  if (htmlPages.includes(event.rawPath) && !response.headers["cache-control"]) {
    response.headers["cache-control"] = "public, max-age=0, s-maxage=31536000, must-revalidate";
  }
  console.log({ after: response });

  return response;
};

function loadHtmlPages() {
  const filePath = path.join(nextDir, "server", "pages-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return Object.entries(JSON.parse(json))
    .filter(([_, value]) => value.endsWith(".html"))
    .map(([key]) => key);
}

function loadPrerenderPages() {
  const filePath = path.join(nextDir, "prerender-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return Object.keys(JSON.parse(json).routes);
}


//const createApigHandler = () => {
//  const config = loadConfig();
//  const requestHandler = new NextServer(config).getRequestHandler();
//
//  return async (event) => {
//    const request = convertApigRequestToNext(event);
//    const response = await requestHandler(request);
//    return convertNextResponseToApig(response);
//  };
//};
//
//export const handler = createApigHandler();