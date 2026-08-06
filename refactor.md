sommet/
│   .gitignore
│   README.md
│
├───backend/                       ← the one shared service
│       main.py
│       models.py
│       schemas.py
│       database.py
│       requirements.txt
│       .env.example
│       README.md
│
├───portfolio/                     ← current root index.html/app.js/style.css
│       index.html
│       app.js
│       style.css
│       package.json
│
├───sites/
│   ├───press-expedition-50/
│   │   │   index.html
│   │   │   app.js
│   │   │   course-map.js
│   │   │   style.css
│   │   │   register.html
│   │   │   register.css
│   │   │   register.js
│   │   │   config.js              ← sets window.SOMMET_API_BASE for this site
│   │   └───assets/
│   │           pexels-brandie-9391031.jpg
│   │           pexels-brandie-9391031.png
│   │           Press_Expedition_Traverse.gpx
│   │           Seattle_Press_Exploring...jpeg
│   │
│   ├───puddlejumpers/
│   │       index.html
│   │       style.css
│   │       config.js
│   │
│   └───solstice-mile/
│           index.html
│           app.js
│           style.css
│           config.js
│
├───demos/                         ← portfolio pieces, not live races
│   ├───wurl-course-map/
│   │   │   index.html
│   │   │   app.js
│   │   │   fly_through.js
│   │   │   torus.js
│   │   │   scrollytelling.js
│   │   │   style.css
│   │   └───data/
│   │           wurl-hero.mp4
│   │           WURL_Wasatch_Ultimate_Ridge_Linkup.gpx
│   └───ins_live_map/
│
└───packages/                       ← empty for now, see below
