const express = require("express");
  
const app = express();
app.get("/", function(_, response){
      
    response.send("<h1>Главная страница</h1>");
});
app.use("/dynamic", function(request, response){
    const a = request.query.a;
    const b = request.query.b;
    const c = request.query.c;

    if (a === undefined || b === undefined || c === undefined) {
        return response.status(400).send("<h1>Ошибка: отсутствуют параметры a, b или c</h1>");
    }

    const numA = parseFloat(a);
    const numB = parseFloat(b);
    const numC = parseFloat(c);
    
    if (isNaN(numA) || isNaN(numB) || isNaN(numC)) {
        return response.status(400).send("<h1>Ошибка: параметры должны быть числами</h1>");
    }

    response.send(`<header>Calculated<header> <body>${(a*b*c)/3}<body>`);
});
app.get("/static", function(_, response){
      
    response.send("<header>Hello<header><body>Octagon NodeJS Test<body>");
});

 
app.listen(3000);
