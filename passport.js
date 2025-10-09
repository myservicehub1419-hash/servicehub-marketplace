const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/User');
const passport = require('passport');

const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET,
    algorithms: ['HS256']
};

passport.use(new JwtStrategy(opts, async (jwt_payload, done) => {
    try {
        const user = await User.findById(jwt_payload.id).select('-password');
        if (user) {
            return done(null, user);
        }
        return done(null, false);
    } catch (error) {
        console.error('JWT Strategy error:', error);
        return done(error, false);
    }
}));

module.exports = passport;
