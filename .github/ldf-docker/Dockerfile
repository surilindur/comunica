FROM node:22-alpine

ADD https://github.com/LinkedDataFragments/Server.js.git /opt/ldf-server

WORKDIR /opt/ldf-server

RUN yarn install

CMD [ "yarn", "ldf-server", "config.json", "5000", "1" ]
