// AUTO-GENERADO por scripts/generate-pixel-sprites.mjs — no editar a mano.
// Cada estado es una fila de la hoja; cada frame, una columna.
export const PIBBLE_SHEET = {
  "file": "sprites/pibble.png",
  "frameWidth": 48,
  "frameHeight": 48,
  "columns": 6,
  "rows": 17,
  "states": {
    "sleep": {
      "row": 0,
      "frames": 2,
      "fps": 3,
      "loop": true
    },
    "wake": {
      "row": 1,
      "frames": 4,
      "fps": 5,
      "loop": false,
      "next": "idle"
    },
    "idle": {
      "row": 2,
      "frames": 4,
      "fps": 4,
      "loop": true
    },
    "walk": {
      "row": 3,
      "frames": 4,
      "fps": 8,
      "loop": true
    },
    "run": {
      "row": 4,
      "frames": 4,
      "fps": 10,
      "loop": true
    },
    "sit": {
      "row": 5,
      "frames": 2,
      "fps": 2,
      "loop": true
    },
    "lie": {
      "row": 6,
      "frames": 2,
      "fps": 2,
      "loop": true
    },
    "play": {
      "row": 7,
      "frames": 4,
      "fps": 5,
      "loop": true
    },
    "scratch": {
      "row": 8,
      "frames": 4,
      "fps": 6,
      "loop": true
    },
    "pet": {
      "row": 9,
      "frames": 3,
      "fps": 5,
      "loop": true
    },
    "happy": {
      "row": 10,
      "frames": 4,
      "fps": 8,
      "loop": true
    },
    "bark": {
      "row": 11,
      "frames": 4,
      "fps": 8,
      "loop": true
    },
    "growl": {
      "row": 12,
      "frames": 3,
      "fps": 5,
      "loop": true
    },
    "playful_growl": {
      "row": 13,
      "frames": 4,
      "fps": 5,
      "loop": true
    },
    "greet": {
      "row": 14,
      "frames": 4,
      "fps": 4,
      "loop": true
    },
    "pibblino_intro": {
      "row": 15,
      "frames": 6,
      "fps": 8,
      "loop": false,
      "next": "pibblino_idle"
    },
    "pibblino_idle": {
      "row": 16,
      "frames": 4,
      "fps": 3,
      "loop": true
    }
  },
  "zzz": {
    "sleep": [
      [
        39,
        23
      ],
      [
        41,
        21
      ]
    ]
  }
}

export const CAPILAMPARA_SHEET = {
  "file": "sprites/capilampara.png",
  "outfitFile": "sprites/capilampara-outfit.png",
  "glassesFile": "sprites/capilampara-outfit-glasses.png",
  "frameWidth": 48,
  "frameHeight": 48,
  "columns": 4,
  "rows": 11,
  "states": {
    "idle": {
      "row": 0,
      "frames": 4,
      "fps": 3,
      "loop": true
    },
    "walk": {
      "row": 1,
      "frames": 4,
      "fps": 8,
      "loop": true
    },
    "sit": {
      "row": 2,
      "frames": 2,
      "fps": 2,
      "loop": true
    },
    "lie": {
      "row": 3,
      "frames": 2,
      "fps": 2,
      "loop": true
    },
    "read": {
      "row": 4,
      "frames": 4,
      "fps": 3,
      "loop": true
    },
    "study": {
      "row": 5,
      "frames": 4,
      "fps": 4,
      "loop": true
    },
    "sleep": {
      "row": 6,
      "frames": 2,
      "fps": 2,
      "loop": true
    },
    "wake": {
      "row": 7,
      "frames": 4,
      "fps": 5,
      "loop": false,
      "next": "idle"
    },
    "pet": {
      "row": 8,
      "frames": 3,
      "fps": 4,
      "loop": true
    },
    "greet": {
      "row": 9,
      "frames": 4,
      "fps": 4,
      "loop": true
    },
    "dress": {
      "row": 10,
      "frames": 4,
      "fps": 6,
      "loop": false,
      "next": "idle"
    }
  },
  "lampAnchors": {
    "idle": [
      [
        31,
        6
      ],
      [
        31,
        6
      ],
      [
        31,
        6
      ],
      [
        32,
        7
      ]
    ],
    "walk": [
      [
        31,
        5
      ],
      [
        31,
        5
      ],
      [
        31,
        5
      ],
      [
        32,
        6
      ]
    ],
    "sit": [
      [
        31,
        5
      ],
      [
        31,
        7
      ]
    ],
    "lie": [
      [
        29,
        20
      ],
      [
        29,
        22
      ]
    ],
    "read": [
      [
        31,
        9
      ],
      [
        31,
        8
      ],
      [
        31,
        9
      ],
      [
        32,
        8
      ]
    ],
    "study": [
      [
        32,
        8
      ],
      [
        32,
        9
      ],
      [
        32,
        8
      ],
      [
        32,
        9
      ]
    ],
    "sleep": [
      [
        29,
        20
      ],
      [
        29,
        22
      ]
    ],
    "wake": [
      [
        29,
        20
      ],
      [
        29,
        19
      ],
      [
        31,
        4
      ],
      [
        31,
        6
      ]
    ],
    "pet": [
      [
        31,
        3
      ],
      [
        31,
        2
      ],
      [
        32,
        2
      ]
    ],
    "greet": [
      [
        31,
        5
      ],
      [
        31,
        4
      ],
      [
        31,
        5
      ],
      [
        32,
        6
      ]
    ],
    "dress": [
      [
        31,
        6
      ],
      [
        31,
        5
      ],
      [
        31,
        6
      ],
      [
        31,
        5
      ]
    ]
  },
  "lampAnchorsOutfit": {
    "idle": [
      [
        31,
        2
      ],
      [
        31,
        2
      ],
      [
        31,
        2
      ],
      [
        32,
        3
      ]
    ],
    "walk": [
      [
        31,
        1
      ],
      [
        31,
        1
      ],
      [
        31,
        1
      ],
      [
        32,
        2
      ]
    ],
    "sit": [
      [
        31,
        1
      ],
      [
        31,
        3
      ]
    ],
    "lie": [
      [
        29,
        16
      ],
      [
        29,
        18
      ]
    ],
    "read": [
      [
        31,
        5
      ],
      [
        31,
        4
      ],
      [
        31,
        5
      ],
      [
        32,
        4
      ]
    ],
    "study": [
      [
        32,
        4
      ],
      [
        32,
        5
      ],
      [
        32,
        4
      ],
      [
        32,
        5
      ]
    ],
    "sleep": [
      [
        29,
        16
      ],
      [
        29,
        18
      ]
    ],
    "wake": [
      [
        29,
        16
      ],
      [
        29,
        15
      ],
      [
        31,
        0
      ],
      [
        31,
        2
      ]
    ],
    "pet": [
      [
        31,
        0
      ],
      [
        31,
        0
      ],
      [
        32,
        0
      ]
    ],
    "greet": [
      [
        31,
        1
      ],
      [
        31,
        0
      ],
      [
        31,
        1
      ],
      [
        32,
        2
      ]
    ],
    "dress": [
      [
        31,
        2
      ],
      [
        31,
        1
      ],
      [
        31,
        2
      ],
      [
        31,
        1
      ]
    ]
  }
}

export const LAMP_SHEET = {
  file: 'sprites/lamp.png',
  frameWidth: 12,
  frameHeight: 12,
  frames: 4,
  fps: 6,
}

export const GLOW_SHEET = {
  file: 'sprites/glow.png',
  frameWidth: 64,
  frameHeight: 64,
  frames: 3,
  fps: 5,
}

export const ZZZ_SHEET = {
  file: 'sprites/zzz.png',
  frameWidth: 16,
  frameHeight: 16,
  frames: 3,
  fps: 3,
}

export const HEART_SHEET = {
  file: 'sprites/heart.png',
  frameWidth: 11,
  frameHeight: 10,
  frames: 2,
  fps: 6,
}

export const SPARKLE_SHEET = {
  file: 'sprites/sparkle.png',
  frameWidth: 12,
  frameHeight: 12,
  frames: 3,
  fps: 8,
}

export const UI_ASSETS = {
  bubble: 'sprites/bubble.png',
  bubbleTail: 'sprites/bubble-tail.png',
  dither: 'sprites/dither.png',
  floor: 'sprites/floor.png',
}
