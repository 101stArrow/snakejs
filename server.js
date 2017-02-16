var express = require('express'),
		ejs = require('ejs'),
		low = require('lowdb'),
		_ = require('lodash'),
		app = express(),
		io = require('socket.io')(3005);

var PORT = 3004;
var db = low('db.json');
var ingame = []

db.get('ingame').remove().write()

db.defaults({
  players: [],
  leaderboard: [],
	ingame: [],
	champion: {}
}).write()

app.get('/', function(req, res){
	res.render('index.ejs')
})

app.get('/leaderboard', function(req, res){
	res.render('leaderboard.ejs');
})

app.get('/user/:username', function(req, res){
	res.render('users.ejs', {
		user: db.get('players').find({username: req.params.username}).value(),
		games: db.get('leaderboard').filter({username: req.params.username}).sortBy('time').value(),
	})
})

app.use(express.static(__dirname + '/public/'));

io.on('connection', function (socket) {
  socket.on('startgame', function(data){
			if(db.get('players').find({ username: data.username}).value()){
				// Returning Player
			} else {
				// New Player
				db.get('players').push({username: data.username, highscore: 0}).write()
			}
			gameobj = {
				username: data.username,
				socket: socket.id,
				start: Date.now(),
				fruitx: Math.ceil(Math.random()*(data.bwidth-3))+1,
				fruity:	Math.ceil(Math.random()*(data.bheight-3))+1,
				length: 5,
				score: 0
			}
			db.get('ingame').push(gameobj).write()
			socket.emit('fruitlocation', {fruitx: gameobj.fruitx, fruity: gameobj.fruity})
			socket.emit('score', {score: gameobj.score, length: gameobj.length})
	})
	socket.on('death', function (data) {
		if(data.score > 1){
			io.emit('leaderboard', data)
		}
		db.get('leaderboard').push({username: data.username, score: data.score, time: data.time}).write()
		gameobj = db.get('ingame').find({'socket': socket.id }).value()
		player = db.get('players').find({ username: gameobj.username}).value()
		champion = db.get('champion').value()
		if(data.score > player.highscore){
			player.highscore = data.score
			db.get('players').find({ username: data.username}).update(player).write()
			socket.emit('news', {
				title: "High Score",
				body: "You achieved a new personal highscore. "+data.score+" is now your score to beat"
			});
		}
		if(data.score > champion.score){
			db.get('champion').assign(data)
			io.emit('news', {
				title: "New Champion",
				body: data.username+" is the new Champion with "+data.score+" points. That is now the score to beat"
			});
		}
		gameobj = db.get('ingame').find({'socket': socket.id }).value()
		io.emit('live-leaderboard', {username: gameobj.username, score: -1})
		db.get('ingame').remove({'socket': socket.id }).write()
  });
  socket.on('redirection', function (data) {
    console.log(data);
  });
	socket.on('getfruit', function (data) {
		gameobj = db.get('ingame').find({'socket': socket.id }).value()
		if(data.headx == gameobj.fruitx && data.heady == gameobj.fruity){
			gameobj.score++
			gameobj.length += gameobj.score
		}
		gameobj.fruitx = Math.ceil(Math.random()*(data.bwidth-3))+1,
		gameobj.fruity =	Math.ceil(Math.random()*(data.bheight-3))+1;
		socket.emit('fruitlocation', {fruitx: gameobj.fruitx, fruity: gameobj.fruity})
		socket.emit('score', {score: gameobj.score, length: gameobj.length})
		io.emit('live-leaderboard', {username: gameobj.username, score: gameobj.score, time: gameobj.start})
		db.get('ingame').find({'socket': socket.id }).assign(gameobj).write()
  });
	socket.on('disconnect', function(){
		db.get('ingame').remove({'socket': socket.id }).write()
	})
	socket.on('getleaderboard', function (data) {
    db.get('leaderboard').sortBy('score').reverse().take(25).value().forEach(function(e){
			if(e.score > 1){
				socket.emit('leaderboard', e)
			}
		})
		db.get('ingame').value().forEach(function(e){
			if(e.score > 1){
				socket.emit('live-leaderboard', {username: e.username, score: e.score, time: e.start})
			}
		})
  });
});

app.listen(PORT)
