const express = require("express");
  
const app = express();
app.get("/", function(_, response){
      
    response.send("<h1>Главная страница</h1>");
});
app.use("/dynamic", function(request, response){
      
    const a = request.query.a;
    const b = request.query.b;
    const c = request.query.c;
    response.send(`<header>Calculated<header> <body>${(a*b*c)/3}<body>`);
});
app.get("/static", function(_, response){
      
    response.send("<header>Hello<header><body>Octagon NodeJS Test<body>");
});

 
app.listen(3000);