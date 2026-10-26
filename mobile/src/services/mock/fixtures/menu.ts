import type { ImageKey } from '@/assets/imageRegistry';
import type { DietaryMarker } from '@/types';

/**
 * FRONTEND MOCK DATA — approved client snapshot, ported verbatim from the design export
 * (mock-data.js). Original menu facts, prices and image choices are preserved exactly.
 * Replace with the published menu (TapTouch / POS) via the API repositories.
 *
 * `priceSource: 'web'` marks prices taken from the website rather than the POS export.
 * Generated once from the export; edit freely from here on.
 */
export interface ModifierGroupRecord {
  id: string;
  name: string;
  required: boolean;
  /** 1 = single choice, 0 = any number */
  max: number;
  options: [name: string, price: number][];
}

export interface CategoryRecord {
  id: string;
  name: string;
  note: string;
}

export interface MenuItemRecord {
  id: string;
  cat: string;
  name: string;
  price: number;
  priceSource?: 'web';
  diet: DietaryMarker[];
  img: ImageKey | null;
  desc: string;
  featured?: boolean;
  mods: ModifierGroupRecord[];
}

/** Compact labels for the category rail (prototype SHORT map). */
export const CATEGORY_SHORT_NAMES: Record<string, string> = {
  allday: 'All Day', acai: 'A\u00e7ai', salads: 'Salads', burgers: 'Burgers', bites: 'Bites', kids: 'Kids',
  addons: 'Add Ons', takeaway: 'Takeaway', coffee: 'Coffee', cold: 'Cold Drinks', smoothies: 'Smoothies', juices: 'Juices',
};

// Modifier groups (TapTouch option groups + website menu choices)
const HOT_DRINK: ModifierGroupRecord = { id:'drink', name:'Choose your drink', required:true, max:1, options:[
  ['Flat White',0.5],['Latte',0.5],['Cappucino',0.5],['Piccolo',0.5],['Magic',0.5],['Mocha',0.5],['Long Black',0.5],['Macchiato',0],['Espresso',0],['Double Espresso',0.5],['Batch Brew',0.5],['Hot Chocolate',0],['Affogato',2]] };
const VARIATION: ModifierGroupRecord = { id:'var', name:'Drink variation', required:false, max:0, options:[
  ['Large',1],['Takeaway',0],['Full Cream',0],['Skim Milk',0],['Fresh Lactose Free',0.8],['Bonsoy',0.8],['OAT ADC',0.8],['Milklab Almond',0.8],['Decaf',0.8],['Extra Shot',0.8],['2 Extra Shot',1.6],['Caramel Syrup',0.8],['Hazelnut Syrup',0.8],['Vanilla Syrup',0.8],['Honey',0.8],['1 Sugar',0],['1 Equal',0],['Warm',0],['Hot',0],['Boiling Hot',0],['1/2 strength',0],['3/4 Full',0]] };
const ADDONS: ModifierGroupRecord = { id:'add', name:'Add ons', required:false, max:0, options:[
  ['Poached Egg',3],['Smoked Bacon',6],['Grilled Halloumi',6],['Garlic Thyme Mushroom',6],['Avocado',5],['Hash Brown',3],['Danish Feta',3],['Grilled Chicken',8],['Smoked Salmon',8]] };
const SMOOTHIE_ADD: ModifierGroupRecord = { id:'sadd', name:'Add ons', required:false, max:0, options:[['Pea Protein',3],['Whey Protein',3],['Fresh Fruit',3]] };
const ACAI_ADD: ModifierGroupRecord = { id:'aadd', name:'Add ons', required:false, max:0, options:[['Fruit',3],['Pea Protein',3],['Whey Protein',3],['Peanut Butter',3],['Nutella',3]] };
const GFO: ModifierGroupRecord = { id:'gfo', name:'Bun', required:true, max:1, options:[['Milk Bun',0],['Gluten Free Bun',1]] };

// Menu category order and labels: replace with the published menu taxonomy.
export const CATEGORY_RECORDS: CategoryRecord[] = [
  { id:'allday', name:'All Day Meals', note:'Monday – Sunday, 6am–3pm' },
  { id:'acai', name:'Açai Bowls', note:'' },
  { id:'salads', name:'Salads', note:'' },
  { id:'burgers', name:'Burgers', note:'Served with house baked potato slices' },
  { id:'bites', name:'Bite Sized', note:'' },
  { id:'kids', name:'Kids', note:'' },
  { id:'addons', name:'Add Ons', note:'' },
  { id:'takeaway', name:'Takeaway Meals', note:'Weekdays only with 8oz coffee' },
  { id:'coffee', name:'Coffee & Hot Drinks', note:'' },
  { id:'cold', name:'Cold Drinks', note:'' },
  { id:'smoothies', name:'Smoothies', note:'' },
  { id:'juices', name:'Juices', note:'' }
];

const D = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean) as DietaryMarker[];
// 84 approved menu items, prices and image mappings: replace with published menu data.
export const MENU_RECORDS: MenuItemRecord[] = [
  { id:"original-allday-1", cat:"allday", name:"Housemade Sourdough", price:9, priceSource:"web", diet:[], img:'menu/food/housemade-sourdough', desc:"Choice of Toast - Plain/Mix Grain/Gluten Free + $1 / Fig + Raisin + $1 w. Butter and Peanut Butter or Housemade Jam or Honey", mods:[] },
  { id:'mighty', cat:'allday', name:"Mighty Breakfast", price:35, diet:D("GF*,DF*"), img:'menu/food/mighty-breakfast', desc:"Sourdough, Smoked Bacon, Free Range Eggs, Grilled Chorizo, Avocado, Halloumi, Hash Brown, Greens, Garlic Thyme Mushroom, Warmed Tomato", featured:true, mods:[ADDONS] },
  { id:'bburger', cat:'allday', name:"Breakfast Burger", price:23, diet:D("GF*,Vegan,Vegetarian"), img:'menu/food/breakfast-burger', desc:"Smoked Bacon, Fried Eggs, Grilled Halloumi, Grilled Hashbrown, Avocado, Mixed Leaf Lettuce, Sliced Cheese, Beetroot Relish, Homemade Aioli / Vegan-O - Mixed Leaf Lettuce, Beetroot Relish, House Made Tomato Relish, Seasoned Scrambled Tofu, Sliced Tomato, Avocado", mods:[{ id:'style', name:'Style', required:true, max:1, options:[['Original',0],['Vegan-O: scrambled tofu, tomato relish',0]] }, ADDONS] },
  { id:'granola', cat:'allday', name:"Granola Bowl", price:22, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/granola-bowl', desc:"Berry Yoghurt, House made Vegan & Gluten Free Granola, Loaded with Seasonal Fruits, Poached Pear & Almond/Soy Milk", mods:[{ id:'milk', name:'Milk', required:true, max:1, options:[['Almond Milk',0],['Soy Milk',0]] }] },
  { id:'porridge', cat:'allday', name:"Spiced Oat Porridge", price:20, diet:D("DF*,Vegan,Vegetarian"), img:'menu/food/spiced-oat-porridge', desc:"With Poached Pears, Seed & Nut Mix", mods:[] },
  { id:'avo', cat:'allday', name:"Avo w/Tomato or Mushroom", price:22, diet:D("DF*,GF*,Vegan,Vegetarian"), img:null, desc:"Warmed Tomatoes or Garlic Thyme Mushroom, Sliced Avocado, Danish Feta, Zucchini Ribbons + Snow Pea Tendrils w/ Basil Oil, Sukkah on Sourdough Toast. Add Poached Egg +$3 / Vegan-O - Seasoned Scrambled Mixed Herb Tofu", mods:[{ id:'side', name:'Choose', required:true, max:1, options:[['Warmed Tomatoes',0],['Garlic Thyme Mushroom',0]] }, { id:'egg', name:'Extras', required:false, max:0, options:[['Poached Egg',3],['Vegan-O: scrambled herb tofu',0]] }] },
  { id:'waffle', cat:'allday', name:"Vegan Buckwheat Waffle", price:22, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/vegan-buckwheat-waffle', desc:"House made Waffle, Date Sauce, Macadamia Crumble, Seasonal Fruits, Vegan & Gluten Free Ice Cream", mods:[] },
  { id:'ftoast', cat:'allday', name:"French Toast", price:22, diet:D("GF*"), img:'menu/food/french-toast', desc:"Brioche, Caramalised Banana, Mixed Berries, Strawberries, Maple Syrup, Berry Jelly, Icing Sugar, Mascarpone w Nutty Crumble & Ice Cream", featured:true, mods:[] },
  { id:'greeneggs', cat:'allday', name:"Green Eggs with Beans", price:20, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/green-eggs-with-beans', desc:"Scrambled Herb Eggs, Smokey Beans w/Sourdough. Add Smokey Meat +$3 / Vegan-O - Mixed Herb Scrambled Tofu w/Vegan Beans", mods:[{ id:'meat', name:'Extras', required:false, max:0, options:[['Smokey Meat',3],['Vegan-O: herb tofu, vegan beans',0]] }, ADDONS] },
  { id:'benedict', cat:'allday', name:"Eggs Benedict", price:23, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/eggs-benedict', desc:"Sourdough, Spinach, Poached Eggs, Hollandaise, Sliced Avocado, Served with Bacon / Leg Ham / Mushroom / Pulled Lamb  +2 / Smoked Salmon +2 / Pulled Beef +2 / Vegan-O - Mushroom, Pumpkin Mixed Seasoned Tofu, House Made Gravy, Sliced Avocado", featured:true, mods:[{ id:'prot', name:'Served with', required:true, max:1, options:[['Bacon',0],['Leg Ham',0],['Mushroom',0],['Pulled Lamb',2],['Smoked Salmon',2],['Pulled Beef',2],['Vegan-O: mushroom, pumpkin tofu, house gravy',0]] }, ADDONS] },
  { id:'burrito', cat:'allday', name:"Burrito Bowl", price:26, priceSource:'web', diet:D("GF*,DF*,Vegan,Vegetarian"), img:'menu/food/burrito-bowl', desc:"Chicken - Chicken Chipotle Hummus, Spinach, Brown Rice, Salsa, Taco Pickle, Avocado / Vegan-O - Chipotle Spiced Beans, Mushroom, Cauliflower, Hummus, Spinach, Brown Rice, Salsa, Taco Pickle, Avocado", mods:[{ id:'style', name:'Style', required:true, max:1, options:[['Chicken',0],['Vegan-O: chipotle beans, mushroom, cauliflower',0]] }] },
  { id:'fish', cat:'allday', name:"Grilled Lime Fish", price:26, diet:D("DF*,GF*"), img:'menu/food/grilled-lime-fish', desc:"Barramundi/Salmon, Garden Salad, Baby Carrots, Hummus, Broccolini and Potato Wedges", mods:[{ id:'fish', name:'Fish', required:true, max:1, options:[['Barramundi',0],['Salmon',0]] }] },
  { id:'risotto', cat:'allday', name:"Risotto", price:22, diet:D("Gluten free"), img:'menu/food/risotto', desc:"Choose from - Ratatouille (Red Capsicum, Zucchini, Eggplant)/ Chilli Chicken & Mushroom/ Spicy Prawns", mods:[{ id:'kind', name:'Choose', required:true, max:1, options:[['Ratatouille',0],['Chilli Chicken & Mushroom',0],['Spicy Prawns',0]] }] },
  { id:'linguine', cat:'allday', name:"Linguine", price:24, diet:[], img:'menu/food/linguine', desc:"Choose from - Ratatouille (Red Capsicum, Zucchini, Eggplant)/ Spicy Prawn / Creamy Chicken Pesto / Provencal Beef", mods:[{ id:'kind', name:'Choose', required:true, max:1, options:[['Ratatouille',0],['Spicy Prawn',0],['Creamy Chicken Pesto',0],['Provencal Beef',0]] }] },
  { id:'serenade', cat:'allday', name:"Chicken Serenade", price:26, diet:D("DF*,GF*"), img:'menu/food/chicken-serenade', desc:"Grilled free range boneless chicken on roasted vegetable canvas with Risotto", mods:[] },
  { id:'tacos', cat:'allday', name:"Soft Tacos (3pcs)", price:24, diet:D("Gluten free"), img:'menu/food/soft-tacos', desc:"Cooked Beans, Salsa, Lettuce, Avocado, Taco veg, Jalapeno, Smokey Sour Chipotle Crema, Lemon Wedge w. Halloumi/ Pulled Lamb/ Pulled Beef/ Chicken/ Seasoned Tofu", mods:[{ id:'fill', name:'Filling', required:true, max:1, options:[['Halloumi',0],['Pulled Lamb',0],['Pulled Beef',0],['Chicken',0],['Seasoned Tofu',0]] }] },
  { id:'prawncroissant', cat:'allday', name:"Chili Prawn Croissant", price:24, priceSource:'web', diet:[], img:'menu/food/chilli-prawn-croissant', desc:"Scramble Eggs Cooked in Chili Garlic w. Prawn & Croissant, topped w. Parsley, Lemon Wedge", mods:[] },
  { id:'nourish', cat:'salads', name:"Green Nourish Bowl", price:23, diet:D("GF*,DF*,Vegan,Vegetarian"), img:'menu/food/green-nourish-bowl', desc:"Grilled Zucchini, Cauliflower, Broad Beans, Kale, Asparagus, Semi Dried + Capsicum Pesto, Pepitas, Poached Egg, Chili Salt / VGO - Seasoned Scrambled Tofu", mods:[{ id:'vgo', name:'Option', required:false, max:1, options:[['VGO: seasoned scrambled tofu',0]] }, ADDONS] },
  { id:'japanese', cat:'salads', name:"Japanese Salad", price:23, diet:D("Vegan,Vegetarian,Dairy free,Gluten free"), img:'menu/food/japanese-salad', desc:"Miso Coated Eggplant + Sweet Potato, Spinach, Brown Rice, Red Cabbage, Grilled Broccolini, Miso, Tahini, Pickled Ginger, Nori + Nigella Seeds", featured:true, mods:[ADDONS] },
  { id:'lamb', cat:'salads', name:"Chermoula Lamb", price:28, diet:D("Gluten free,Dairy free"), img:'menu/food/chermoula-lamb', desc:"Pulled Lamb in Chermoula Spices, Pumpkin, Quinoa Delight, Cherry Tomato, Hummus, Pine Nuts + Currants", mods:[] },
  { id:'super', cat:'salads', name:"Super Salad", price:22, diet:D("Vegan,Vegetarian,Gluten free,Dairy free"), img:'menu/food/super-salad', desc:"Quinoa Delight, Brown Rice, Alfalfa, Avocado, Kale, Spinach, Carrot, Seed Nut Mix, Beetroot, Apple, Turmeric Cauliflower, Goji Berries", mods:[ADDONS] },
  { id:'nutri', cat:'salads', name:"Nutritional Bowl", price:24, priceSource:'web', diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/nutritional-bowl', desc:"Tumeric Cauliflower, Red Chilli, Spanish Onion, Quinoa Delight, Asparagus, Kale, Spinach, Grilled Chicken Tahini, Currants, Seed Nut Mix / VGO - Diced Seasoned Tofu", mods:[] },
  { id:'beef', cat:'burgers', name:"Beef", price:23, priceSource:'web', diet:D("GF*,DF*"), img:'menu/food/beef-burger', desc:"House made Brisket Patty, Beetroot Relish, Tomato, Cheese, House mad Aioli, Mixed Leaf Lettuce / GFO +$1", mods:[GFO] },
  { id:'chicken', cat:'burgers', name:"Chicken", price:23, priceSource:'web', diet:D("GF*,DF*"), img:'menu/food/chicken-burger', desc:"Morocco Spiced Chicken, Avocado, Tomato, Mixed Leaf Lettuce, Sliced Cheese & House made Aioli / GFO +$1", mods:[GFO] },
  { id:'vegan', cat:'burgers', name:"Vegan", price:23, priceSource:'web', diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/vegan-burger', desc:"Oven Baked Vegan Pattie, Tomato, Avocado, Mixed Leaf Lettuce, House made Aioli / GFO +$1", mods:[GFO] },
  { id:'halloumi', cat:'burgers', name:"Halloumi", price:23, priceSource:'web', diet:D("GF*,Vegan"), img:'menu/food/halloumi-burger', desc:"Grilled Halloumi, Spiced Mushroom, Avocado, Sliced Tomato, House Made Aioli, Mixed Leaf Lettuce, Beetroot Relish / GFO +$1", mods:[GFO] },
  { id:'nachos', cat:'bites', name:"Nachos", price:18, diet:D("DF*,Vegan,Vegetarian,Gluten free"), img:'menu/food/nachos', desc:"Smashed Avocado, Salsa + Beans w/House Sauce, Jalapeños, Sour Cream, Mexican Cheese  / Add Pulled Beef/Grilled Chicken +$5", mods:[] },
  { id:'twist', cat:'bites', name:"Avocado Twist", price:17, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/avocado-twist', desc:"Chili, Diced Avocado, Lime Salsa, Parsley, Diced Bacon, Danish Feta on Sourdough.  / Add Poached Egg +$3 / VGO - Seasoned Scramble Tofu", mods:[] },
  { id:'smashed', cat:'bites', name:"Smashed Avo & Feta", price:15, diet:D("GF*,Vegan,DF*"), img:'menu/food/smashed-avo-feta', desc:"Avocado, Danish Feta, Poached Egg & Lemon on Sourdough / Add Hash Brown +$3 / GFO +$1", mods:[ADDONS] },
  { id:'brekky', cat:'bites', name:"Brekky Roll", price:15, diet:D("GF*"), img:'menu/food/bacon-egg-roll', desc:"Double Bacon, Double Egg, Cheese, House made Tomato Relish / Add Hash Brown +$3 / GFO +$1", mods:[] },
  { id:"original-bites-5", cat:"bites", name:"Sliced Seasoned Potato", price:11, priceSource:"web", diet:D("Vegan,Vegetarian,Gluten free,Dairy free"), img:'menu/food/sliced-seasoned-potato', desc:"Housemade Baked Potato w Herbs & Spices w. Housemade Aioli, Lemon Wedge", mods:[] },
  { id:'loaded', cat:'bites', name:"Loaded Potato", price:15, diet:D("DF*,Gluten free"), img:'menu/food/loaded-potato', desc:"Housemade Baked Potato Wedge Loaded w. Mexican Cheese, Diced Bacon w. Housemade Aioli, Lemon Wedge", mods:[] },
  { id:'kwaffle', cat:'kids', name:"Buckwheat Waffle", price:14, priceSource:'web', diet:D("Vegan,Vegetarian,Gluten free,Dairy free"), img:'menu/food/kids-buckwheat-waffle', desc:"Housemade Waffle, Fresh Strawberry, Date Sauce & Ice Cream", mods:[] },
  { id:'kftoast', cat:'kids', name:"French Toast", price:14, priceSource:'web', diet:D("DF*,GF*"), img:'menu/food/kids-french-toast', desc:"Brioche, Maple Syrup, Fresh Strawberry, Ice Cream / GFO +$1", mods:[] },
  { id:"original-kids-3", cat:"kids", name:"Croissant", price:7, priceSource:"web", diet:[], img:'menu/food/croissant', desc:"Plain Croissant w Jam / w. Ham & Cheese +$2/ HCT +$3/ Cheese +$1", mods:[] },
  { id:'banana', cat:'kids', name:"Jacked Up Banana Bread", price:17, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/jacked-up-banana-bread', desc:"Banana Bread, Ice Cream, Macadamia Crumble, Nutty Drizzle, Fresh Banana and Strawberry / GFO +$1", mods:[] },
  { id:"original-addons-1", cat:"addons", name:"Grilled Chicken/Grilled Salmon/Smoked Salmon", price:8, priceSource:"web", diet:[], img:'menu/food/add-ons-breakfast-bowl', desc:"", mods:[] },
  { id:"original-addons-2", cat:"addons", name:"Smoked Bacon", price:6, priceSource:"web", diet:[], img:null, desc:"", mods:[] },
  { id:"original-addons-3", cat:"addons", name:"Grilled Halloumi/ Seasoned Warmed Tomatoes/ Garlic Thyme Mushroom", price:6, priceSource:"web", diet:[], img:null, desc:"", mods:[] },
  { id:"original-addons-4", cat:"addons", name:"Avocado/ Spinach + Kale/ Scrambled Tofu / Housemade Gravy", price:5, priceSource:"web", diet:[], img:null, desc:"", mods:[] },
  { id:"original-addons-5", cat:"addons", name:"Free Range Eggs (Poached/Fried/Scramble +$1)", price:5, priceSource:"web", diet:[], img:null, desc:"", mods:[] },
  { id:"original-addons-6", cat:"addons", name:"Grilled Chorizo", price:6, priceSource:"web", diet:[], img:null, desc:"", mods:[] },
  { id:"original-addons-7", cat:"addons", name:"Hash Brown/ Danish Feta", price:3, priceSource:"web", diet:[], img:null, desc:"", mods:[] },
  { id:"original-takeaway-1", cat:"takeaway", name:"Sandwich", price:13.9, priceSource:"web", diet:[], img:'menu/food/sandwich', desc:"Vegetarian/HCT/Smoked Salmon & Chicken+$1", mods:[] },
  { id:"original-takeaway-2", cat:"takeaway", name:"B&E Roll/Wrap", price:12.9, priceSource:"web", diet:[], img:'menu/food/bacon-egg-wrap', desc:"Add Hashbrown +$3", mods:[] },
  { id:"original-takeaway-3", cat:"takeaway", name:"Croissant", price:9.9, priceSource:"web", diet:[], img:'menu/food/bakery-tray-with-coffee', desc:"Plain/Jam/HCT +$3/Cheese & Tomato +$2/ Cheese +$1", mods:[] },
  { id:'hotcoffee', cat:'coffee', name:"Milk Based Coffee", price:5, diet:[], img:'menu/coffee/milk-based-coffee', desc:"", featured:true, mods:[HOT_DRINK, VARIATION] },
  { id:'hotchoc', cat:'coffee', name:"Hot Chocolate", price:5, priceSource:'web', diet:D("GF*,Vegan"), img:'menu/coffee/hot-chocolate-glass', desc:"", mods:[VARIATION] },
  { id:'longblack', cat:'coffee', name:"Long Black", price:5, priceSource:'web', diet:[], img:'menu/coffee/long-black', desc:"Served with Sparkling Water", mods:[VARIATION] },
  { id:"original-coffee-4", cat:"coffee", name:"Sticky Chai", price:6, priceSource:"web", diet:[], img:'menu/drinks/prana-sticky-chai', desc:"Brewed on Bonsoy", mods:[] },
  { id:'matcha', cat:'coffee', name:"Matcha Latte", price:6, diet:[], img:'menu/coffee/matcha-latte', desc:"Brewed on MilkLab Almond & Honey", mods:[VARIATION] },
  { id:'turmeric', cat:'coffee', name:"Turmeric Latte", price:5.5, diet:[], img:'menu/coffee/turmeric-latte', desc:"Brewed on MilkLab Almond & Honey", mods:[VARIATION] },
  { id:"original-coffee-7", cat:"coffee", name:"Chamellia Organic Teapot", price:5, priceSource:"web", diet:[], img:'menu/drinks/chamellia-organic-teapot', desc:"English breakfast, Chamomile, Peppermint, China Sencha (green), Earl Grey, Lemongrass & Ginger, Masala Chai", mods:[] },
  { id:"original-coffee-8", cat:"coffee", name:"Babychino", price:2.5, priceSource:"web", diet:[], img:'menu/coffee/babychino', desc:"w MarshMello", mods:[] },
  { id:"original-coffee-9", cat:"coffee", name:"Puppychino", price:3.5, priceSource:"web", diet:[], img:'menu/drinks/puppichino', desc:"w Doggy Treat", mods:[] },
  { id:"original-coffee-10", cat:"coffee", name:"Add Ons", price:0.7, priceSource:"web", diet:[], img:null, desc:"Large, X Shot, Decaf, Syrup, Milk Lab Alternative, Bonsoy, ADC Oat", mods:[] },
  { id:'icedlatte', cat:'cold', name:"Iced Latte", price:6, priceSource:'web', diet:[], img:'menu/coffee/iced-latte', desc:"", mods:[VARIATION] },
  { id:"original-cold-2", cat:"cold", name:"Iced Long Black", price:5.5, priceSource:"web", diet:[], img:'menu/coffee/iced-long-black', desc:"", mods:[] },
  { id:"original-cold-3", cat:"cold", name:"Iced Coffee", price:8, priceSource:"web", diet:[], img:'menu/drinks/iced-coffee', desc:"", mods:[] },
  { id:'coldbrew', cat:'cold', name:"Cold Brew", price:5.5, priceSource:'web', diet:[], img:'menu/coffee/cold-brew', desc:"", mods:[] },
  { id:'karma', cat:'cold', name:"Karma Cola (Organic)", price:5.5, diet:[], img:'menu/drinks/karma-cola', desc:"Cola, Cola Sugar Free, Lemonade, Ginger Beer", mods:[{ id:'fl', name:'Flavour', required:true, max:1, options:[['Cola',0],['Cola Sugar Free',0],['Lemonade',0],['Ginger Beer',0]] }] },
  { id:'kombucha', cat:'cold', name:"Probiotic Kombucha (Remedy)", price:5.5, priceSource:'web', diet:[], img:'menu/drinks/remedy-kombucha', desc:"Ginger Lemon, Lemon Lime Mint, Peach", mods:[{ id:'fl', name:'Flavour', required:true, max:1, options:[['Ginger Lemon',0],['Lemon Lime Mint',0],['Peach',0]] }] },
  { id:"original-cold-7", cat:"cold", name:"Coca Cola Range", price:5, priceSource:"web", diet:[], img:'menu/drinks/coca-cola', desc:"330ml", mods:[] },
  { id:"original-cold-8", cat:"cold", name:"San Pellegrino", price:5, priceSource:"web", diet:[], img:'menu/drinks/san-pellegrino-750ml', desc:"250ml/750ml · Small $5 / Large $10", mods:[{ id:"size", name:"Size", required:true, max:1, options:[["Small",0],["Large",5]] }] },
  { id:"original-cold-9", cat:"cold", name:"Milkshake", price:7, priceSource:"web", diet:[], img:'menu/drinks/milkshakes', desc:"Mango/Banana/Strawberry/Chocolate/Coffee / Make it thick shake +$1", mods:[] },
  { id:'breakfast', cat:'smoothies', name:"Break (the) Fast", price:10.9, diet:[], img:'menu/smoothies/break-the-fast-smoothie', desc:"Banana, Oats, Cinnamon, Honey, Coconut Yoghurt, Oat Milk, Almonds", mods:[SMOOTHIE_ADD] },
  { id:'nutty', cat:'smoothies', name:"Nutty Professor", price:10.9, diet:[], img:'menu/smoothies/nutty-professor-smoothie', desc:"Banana, Maca, Coconut Nectar, Almond Milk, Cacao, Peanut Butter", featured:true, mods:[SMOOTHIE_ADD] },
  { id:'golden', cat:'smoothies', name:"Golden", price:10.9, diet:[], img:'menu/smoothies/golden-smoothie', desc:"Turmeric, Cinnamon, Ginger, Honey, Banana, Dates, Almond Milk", mods:[SMOOTHIE_ADD] },
  { id:"original-smoothies-4", cat:"smoothies", name:"Coffee & Cacao", price:10.9, priceSource:"web", diet:[], img:'menu/smoothies/coffee-and-cacao-smoothie', desc:"Double Espresso, Dates, Cacao, Banana, Chai seeds, Coconut Nectar, Almond Milk", mods:[] },
  { id:'berry', cat:'smoothies', name:"Berry (the) Fast", price:10.9, diet:[], img:'menu/smoothies/berry-the-fast-smoothie', desc:"Strawberries, Raspberry, Blueberry, Coconut Yoghurt, Oat Milk, Oats, Honet", mods:[SMOOTHIE_ADD] },
  { id:'immunity', cat:'smoothies', name:"Matcha Immunity", price:10.9, diet:[], img:'menu/smoothies/matcha-immunity-smoothie', desc:"Coconut Water, Mango, Spinach, Mint Leaves, Pineapple, Matcha", mods:[SMOOTHIE_ADD] },
  { id:'popeye', cat:'smoothies', name:"Popeye", price:10.9, diet:[], img:'menu/smoothies/popeye-smoothie', desc:"Kale, Spinach, Spirulina, Kiwi, Coconut Water, Apple Juice", mods:[SMOOTHIE_ADD] },
  { id:'glow', cat:'smoothies', name:"Glow Pro", price:10.9, diet:[], img:'menu/smoothies/glow-pro-smoothie', desc:"Açai, Blueberry, Raspberry, Coconut Flesh, Honey, Coconut Water, Apple Juice", mods:[SMOOTHIE_ADD] },
  { id:'mango', cat:'smoothies', name:"Mango Maniac", price:10.9, diet:[], img:'menu/smoothies/mango-maniac-smoothie', desc:"Mango, Passionfruit, Pineapple, Coconut Nectar, Coconut Water", mods:[SMOOTHIE_ADD] },
  { id:'refresher', cat:'smoothies', name:"Refresher", price:10.9, diet:[], img:'menu/smoothies/refresher-smoothie', desc:"Cucumber, Mint, Kiwi, Spinach, Coconut Water", mods:[SMOOTHIE_ADD] },
  { id:"original-smoothies-11", cat:"smoothies", name:"Add Ons", price:3, priceSource:"web", diet:[], img:null, desc:"Any Pea/Whey Protein/ Fresh Fruit", mods:[] },
  { id:'acai-o', cat:'acai', name:"The Original 'O' Bowl", price:22, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/original-o-acai-bowl', desc:"Açai, Banana & Apple Juice - Topped with Strawberries, Banana, Granola & Coconut Flakes", featured:true, mods:[ACAI_ADD] },
  { id:'acai-crunch', cat:'acai', name:"Crunch Acai", price:22, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/crunch-acai-bowl', desc:"Organic Acai, Banana, Cocoa, Peanut Butter, Almond Milk - Topped w. Banana, Cacao Nibs, Housemade Granola, Honey Drizzle", mods:[ACAI_ADD] },
  { id:'acai-summer', cat:'acai', name:"Summer Acai", price:22, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/summer-acai-bowl', desc:"Organic Acai, Banana, Mango, Coconut water / Topped w. Mango, Fresh Strawberry, Passionfruit, Macadamia Crumble", mods:[ACAI_ADD] },
  { id:'acai-snicker', cat:'acai', name:"Snicker Acai", price:24, diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/snicker-acai-bowl', desc:"Organic Acai, Banana, Peanut Butter, Cacao, Almond Milk - Topped w. Snicker Bar, Cacao Nibs, Housemade Granola, Caramel Drizzle", mods:[ACAI_ADD] },
  { id:'acai-matcha', cat:'acai', name:"Matcha Heaven Acai", price:22, priceSource:'web', diet:D("DF*,GF*,Vegan,Vegetarian"), img:'menu/food/matcha-heaven-acai-bowl', desc:"Organic Acai, Matcha, Banana, Apple Juice - Topped w. Mango, Pineapple, Fresh Strawberry", mods:[ACAI_ADD] },
  { id:"original-acai-6", cat:"acai", name:"Add Ons", price:3, priceSource:"web", diet:[], img:null, desc:"Add +$3 any Fruit/Pea Protein/ Whey Protein/ Peanut Better/ Nuttela", mods:[] },
  { id:'coldpressed', cat:'juices', name:"Cold Pressed Juice", price:7, diet:[], img:'menu/drinks/cold-pressed-juice', desc:"Green +/Carrot +/Lemon Pineapple +/ Apple Juice", mods:[{ id:'fl', name:'Choose', required:true, max:1, options:[['Green +',0],['Carrot +',0],['Lemon Pineapple +',0],['Apple Juice',0]] }] },
  { id:'freshjuice', cat:'juices', name:"Fresh Juice", price:8.9, diet:[], img:'menu/drinks/fresh-juice', desc:"Orange/Watermelon/Orange + Watermelon", mods:[{ id:'fl', name:'Choose', required:true, max:1, options:[['Orange',0],['Watermelon',0],['Orange + Watermelon',0]] }] }
];
