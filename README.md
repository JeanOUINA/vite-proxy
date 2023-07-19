# Vite Proxy
This project is a proxy for go-vite's api. It is used to provide load balancing and caching for the api, as well as providing features on the node that otherwise would not be possible.

## Features
- [x] Load balancing
- [ ] Caching
- [ ] Rate limiting
- [ ] CORS
- [ ] API key authentication
- [x] VPoW
- [ ] Wallet API

## Load Balancing
If you add multiple nodes to the config.json file, the proxy will automatically load balance between them. It will also automatically remove nodes that are offline.

## Caching
The proxy will cache responses from the nodes. This will reduce the load on the nodes, and improve the response time for the user.

## Rate Limiting
The proxy will rate limit requests to the nodes. This will prevent spamming the nodes with requests, and will prevent the nodes from being overloaded.

## VPoW
The proxy will automatically forward PoW requests to VPoW instead of the node if an API Key is present. This allows users to use VPoW without any other setup or node.

## Wallet API
Due to the load balancing nature of the proxy, using the wallet api is not possible consistently on the nodes directly. The proxy instead has its own version of the api that will work consistently.