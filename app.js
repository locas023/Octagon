const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = 3000;


const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',    
    database: 'ChatBotTests'
});


connection.connect((err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err);
        return;
    }
    console.log('Успешное подключение к базе данных');
});


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/getAllItems', (req, res) => {
    const query = 'SELECT * FROM items';
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error('Ошибка при получении данных:', err);
            return res.json(null);
        }
        res.json(results);
    });
});


app.post('/addItem', (req, res) => {
    const { name, desc } = req.query;
    
  
    if (!name || !desc) {
        return res.json(null);
    }
    
    const query = 'INSERT INTO items (name, desc) VALUES (?, ?)';
    
    connection.query(query, [name, desc], (err, results) => {
        if (err) {
            console.error('Ошибка при добавлении данных:', err);
            return res.json(null);
        }
        
        
        const selectQuery = 'SELECT * FROM items WHERE id = ?';
        connection.query(selectQuery, [results.insertId], (err, itemResults) => {
            if (err || itemResults.length === 0) {
                return res.json({});
            }
            res.json(itemResults[0]);
        });
    });
});


app.post('/deleteItem', (req, res) => {
    const { id } = req.query;
    
    
    if (!id || isNaN(id)) {
        return res.json(null);
    }
    
    
    const selectQuery = 'SELECT * FROM items WHERE id = ?';
    
    connection.query(selectQuery, [id], (err, selectResults) => {
        if (err) {
            console.error('Ошибка при поиске данных:', err);
            return res.json(null);
        }
        
        if (selectResults.length === 0) {
            return res.json({});
        }
        
        const itemToDelete = selectResults[0];
        
        
        const deleteQuery = 'DELETE FROM items WHERE id = ?';
        
        connection.query(deleteQuery, [id], (err, deleteResults) => {
            if (err) {
                console.error('Ошибка при удалении данных:', err);
                return res.json(null);
            }
            
            res.json(itemToDelete);
        });
    });
});


app.post('/updateItem', (req, res) => {
    const { id, name, desc } = req.query;
    
    
    if (!id || isNaN(id) || !name || !desc) {
        return res.json(null);
    }
    
    
    const selectQuery = 'SELECT * FROM items WHERE id = ?';
    
    connection.query(selectQuery, [id], (err, selectResults) => {
        if (err) {
            console.error('Ошибка при поиске данных:', err);
            return res.json(null);
        }
        
        if (selectResults.length === 0) {
            return res.json({});
        }
        
        
        const updateQuery = 'UPDATE items SET name = ?, desc = ? WHERE id = ?';
        
        connection.query(updateQuery, [name, desc, id], (err, updateResults) => {
            if (err) {
                console.error('Ошибка при обновлении данных:', err);
                return res.json(null);
            }

            connection.query(selectQuery, [id], (err, updatedResults) => {
              if (err || updatedResults.length === 0) {
                  return res.json({});
              }
               res.json(updatedResults[0]);
            });
        });
    });
});


app.listen(PORT, () => {
console.log(`Сервер запущен на порту ${PORT}`);
console.log(`Доступные endpoints:`);
console.log(`http://localhost:${PORT}/getAllItems`);
console.log(`http://localhost:${PORT}/addItem?name=TEXT&desc=TEXT2`);
console.log(`http://localhost:${PORT}/deleteItem?id=number`);
console.log(`http://localhost:${PORT}/updateItem?id=number&name=TEXT&desc=TEXT2`);
});          