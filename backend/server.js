require('dotenv').config();
const express=require('express'),cors=require('cors'),path=require('path');
const app=express(), PORT=process.env.PORT||5000, ROOT=path.join(__dirname,'..');

app.use(cors({origin:function(o,cb){cb(null,true);},credentials:true}));
app.use('/api/webhook',require('./routes/webhook'));
app.use(express.json({limit:'2mb'}));
app.use('/api/auth',require('./routes/auth'));
app.use('/api/auth/forgot-password',require('./routes/auth-reset'));
app.use('/api/chat',require('./routes/chat'));
app.use('/api/admin',require('./routes/admin'));

app.get('/api/health',(req,res)=>res.json({status:'ok',v:'2.1'}));
app.get('/admin',(req,res)=>res.sendFile(path.join(ROOT,'admin','index.html')));
app.get('/reset-password',(req,res)=>res.sendFile(path.join(ROOT,'reset-password.html')));
app.get('/taskpane.html',(req,res)=>res.sendFile(path.join(ROOT,'addin','taskpane.html')));
app.get('/',(req,res)=>res.sendFile(path.join(ROOT,'addin','taskpane.html')));
app.get('/manifest.xml',(req,res)=>res.sendFile(path.join(ROOT,'manifest.xml')));
app.use(express.static(path.join(ROOT,'public')));
app.use((err,req,res,next)=>res.status(500).json({error:'Server error.'}));
app.listen(PORT,'0.0.0.0',()=>console.log('Shayntech AI Pro v2.1 port '+PORT));
