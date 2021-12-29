
# FROM alpine as builder1

# RUN apk update && apk add curl
# RUN curl -Lsq -o icu4c-68_2-src.zip \
#     https://github.com/unicode-org/icu/releases/download/release-68-2/icu4c-68_2-src.zip \
#     && unzip -q icu4c-68_2-src.zip


# FROM node:latest as builder2

# WORKDIR /app
# COPY package.json package-lock.json index.js ./
# RUN npm install --prod
# RUN npm rebuild


# FROM astefanutti/scratch-node:latest

# COPY --from=builder1 /icu/source/data/in/icudt68l.dat /icu/
# COPY --from=builder2 /app /

# ENV NODE_ICU_DATA=/icu
# EXPOSE 3000
# ENTRYPOINT ["node", "index.js"]



FROM denoland/deno:alpine

EXPOSE 3000

WORKDIR /app

# Prefer not to run as root.
USER deno

ADD . .
RUN deno cache main.js

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "main.js"]
