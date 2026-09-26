FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_MSG91_WIDGET_ID
ARG VITE_MSG91_WIDGET_TOKEN_AUTH
ENV VITE_MSG91_WIDGET_ID=$VITE_MSG91_WIDGET_ID
ENV VITE_MSG91_WIDGET_TOKEN_AUTH=$VITE_MSG91_WIDGET_TOKEN_AUTH
RUN npm run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx.proxy.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_ORIGIN=http://backend:8080
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
