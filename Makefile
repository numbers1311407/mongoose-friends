test:
	@NODE_ENV=test ./node_modules/.bin/mocha test/*.js

.PHONY: test
