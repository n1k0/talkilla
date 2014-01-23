"use strict";

var util = require("util");
var https = require("https");
var app = require("./server").app;

app.get("/proxy/google/avatar/:email/:id", function(req, res) {
  var format = req.query.format === "base64" ? "base64" : "image";
  var options = {
    method: "GET",
    host: "www.google.com",
    port: 443,
    path: util.format("/m8/feeds/photos/media/%s/%s?v=3.0&access_token=%s",
                      req.params.email,
                      req.params.id,
                      req.query.token),
  };

  var request = https.request(options, function(response) {
    var currentByte = 0,
        // don't ask me why sometimes headers use caps and sometimes not
        contentType = response.headers["Content-Type"] || "image/jpeg",
        // google doesn't always provide a Content-Length header, defaulting to
        // something large enough to deal with avatars; final image is sliced
        // back before sending the result
        size = parseInt(response.headers["content-length"], 10) || 999999,
        body = new Buffer(size);

    response.setEncoding('binary');

    response.on("data", function(chunk) {
      body.write(chunk, currentByte, "binary");
      currentByte += chunk.length;
    });

    response.on("end", function() {
      // trim out unneeded contents
      var finalBody = body.slice(0, currentByte);
      if (format === "image") {
        // raw image contents
        res.type(contentType);
        res.send(finalBody);
      } else {
        // base64 export
        res.type("text/plain");
        res.send(finalBody.toString('base64'));
      }
    });
  });

  request.end();
});
