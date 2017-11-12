const mongoose = require('mongoose');
const Store = mongoose.model('Store');
const User = mongoose.model('User');
const multer = require('multer');
const jimp = require('jimp');
const uuid = require('uuid');

const multerOptions = {
  storage: multer.memoryStorage(),
  fileFilter(req, file, next) {
    const isPhoto = file.mimetype.startsWith('image/');
    if(isPhoto) {
      next(null, true);
    } else {
      next({message: 'The image type is not supported!'}, false);
    }
  }
};
exports.homePage = (req, res) => {
  res.render('index');
};

exports.ohShit = (req, res, next) => {
  res.render('4oh4');
};
exports.addStore = (req, res) => {
  res.render('editStore', { title: 'Make a Rating Review!'});
};
exports.upload = multer(multerOptions).single('photo');
exports.resize = async (req, res, next) => {
  if(!req.file) {
    next();
    return;
  }
  const extension = req.file.mimetype.split('/')[1];
  req.body.photo = `${uuid.v4()}.${extension}`;
  const photo = await jimp.read(req.file.buffer);
  await photo.resize(800, jimp.AUTO);
  await photo.write(`./public/uploads/${req.body.photo}`);
  next();
}

exports.createStore = async (req, res) => {
  req.body.author = req.user._id;
  const store = await (new Store(req.body)).save();
  req.flash('success', `Thank you for adding: ${store.name}. Please leave a review.`)
  res.redirect(`/stores/${store.slug}`);
};
exports.getStores = async (req, res) => {
  const page = req.params.page || 1;
  const limit = 6;
  const skip = (page * limit) - limit;
  //            p  1 * 4        -4
  //            p  2 * 4        -4
  //            p  3 * 4        -4
  //            p  4 * 4        -4
  const storesPromise = Store.find().skip(skip).limit(limit).sort({ created: 'desc'});
  const countPromise = Store.count();
  const [stores, count] = await Promise.all([storesPromise, countPromise]);
  const pages = Math.ceil(count / limit);
  if (!stores.length && skip) {
    req.flash('info', `Hey! Are you lost? Or being a monkey? Because you just asked for page ${page}. But, I don't want to show you - it's a personal thing. So I just put you on page ${pages}`);
    res.redirect(`/stores/page/${pages}`);
    return;
  }
  res.render('stores', { title: 'Raving Reviews!', stores, page, pages, count });
};
const confirmOwner = (store, user) => {
  if (!store.author.equals(user._id)) {
    throw Error('🙅‍♂️ You must be the owner in order to edit it!');
  }
};
exports.editStore = async (req, res) => {
  const store = await Store.findOne({ _id: req.params.id });
  confirmOwner(store, req.user);
  res.render('editStore', { title: `Edit ${store.name}`, store})
};
exports.updateStore = async (req, res) => {
  req.body.location.type = 'Point';
  const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
    new: true,
    runValidators: true
  }).exec();
  req.flash('success', `Successfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">View Store Now →</a>`);
  res.redirect(`/stores/${store._id}/edit`);
};
exports.getStoresBySlug = async (req, res, next) => {
  const store = await Store.findOne({
    slug: req.params.slug }).populate('author review');
  if (!store) return next();
  res.render('store', { store, title: store.name});
};

exports.getStoresByTag = async (req, res) => {
  const tag = req.params.tag;
  const tagQuery = tag || { $exists: true };

  const tagsPromise = Store.getTagsList();
  const storesPromise = Store.find({ tags: tagQuery });
  const [tags, stores] = await Promise.all([tagsPromise, storesPromise]);

  res.render('tag', { tags, title: 'Tags', tag, stores });
};

exports.searchStores = async (req, res) => {
  const stores = await Store
  // first find stores that match
  .find({
    $text: {
      $search: req.query.q
    }
  }, {
    score: { $meta: 'textScore' }
  })
  // the sort them
  .sort({
    score: { $meta: 'textScore' }
  })
  // limit to only 5 results
  .limit(5);
  res.json(stores);
};
exports.mapStores = async (req, res) => {
  const coordinates = [req.query.lng, req.query.lat].map(parseFloat);
  const q = {
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates
        },
        $maxDistance: 10000 // 10km
      }
    }
  };
  const stores = await Store.find(q).select('slug name description location photo').limit(10);
  res.json(stores);
};
exports.mapPage = (req, res) => {
  res.render('map', { title: 'Map' });
};
exports.heartStore = async (req, res) => {
  const hearts = req.user.hearts.map(obj => obj.toString());
  const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet';
  const user = await User.findByIdAndUpdate(req.user._id,
      { [operator]: { hearts: req.params.id } },
      { new: true }
    );
  res.json(user);
};

exports.getHearts = async (req, res) => {
  const stores = await Store.find({
    _id: { $in: req.user.hearts }
  });
  res.render('stores', { title: 'My ❤️ Warmers', stores });
};
exports.getTopStores = async (req, res) => {
  const stores = await Store.getTopStores();
  res.render('topStores', { stores, title:'⭐ Top Stores!'});
}
