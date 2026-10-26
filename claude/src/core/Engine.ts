import * as THREE from 'three';
import { DimensionController } from './DimensionController';
import { Dimension } from '../world/Dimension';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { MobType } from '../entities/MobTypes';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { Physics } from '../player/Physics';
import { InputManager } from './InputManager';
import { Sky } from '../rendering/Sky';
import { PostProcessing } from '../rendering/PostProcessing';
import { createTerrainMaterial, updateMaterialUniforms, updateShadowUniforms } from '../rendering/Materials';
import { createWaterMaterial, updateWaterUniforms, updateWaterShadowUniforms } from '../rendering/WaterMaterial';
import { ShadowSystem } from '../rendering/ShadowSystem';
import { TorchLightManager } from '../rendering/TorchLightManager';
import { HeldItemRenderer } from '../rendering/HeldItemRenderer';
import { SwimmingArms } from '../rendering/SwimmingArms';
import { TextureAtlas } from '../textures/TextureAtlas';
import { BlockInteraction } from '../ui/BlockInteraction';
import { HUD } from '../ui/HUD';
import { ParticleSystem } from '../rendering/Particles';
import { InventorySystem } from '../ui/InventorySystem';
import { InventoryUI } from '../ui/InventoryUI';
import { PauseMenu } from '../ui/PauseMenu';
import { DroppedItemManager } from '../world/DroppedItemManager';
import { ChestManager } from '../world/ChestManager';
import { BlockType, BLOCK_DEFINITIONS } from '../blocks/BlockTypes';
import { ItemType, ITEM_DEFINITIONS } from '../ui/ItemTypes';
import { StructureTypeName } from '../world/StructureGenerator';
import { FOV, NEAR_PLANE, FAR_PLANE } from '../utils/constants';
import { worldSeed } from '../utils/noise';
import { MobManager } from '../entities/MobManager';
import { CombatSystem } from '../entities/CombatSystem';
import { WeatherSystem } from '../rendering/WeatherSystem';
import { DeathScreen } from '../ui/DeathScreen';
import { AchievementManager } from '../ui/Achievements';
import { CommandSystem } from '../ui/CommandSystem';
import { SoundEngine } from '../audio/SoundEngine';
import { ProceduralMusic } from '../audio/ProceduralMusic';
import { XPSystem } from '../ui/XPSystem';
import { Minimap } from '../ui/Minimap';
import { OptionsMenu, GameSettings, QualityName } from '../ui/OptionsMenu';
import { CreativeMenu } from '../ui/CreativeMenu';

type GameState = 'start' | 'playing' | 'inventory' | 'paused' | 'dead';

export class Engine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: InputManager;
  private readonly world: World;
  private readonly player: Player;
  private readonly sky: Sky;
  private readonly postProcessing: PostProcessing;
  private readonly terrainMaterial: THREE.ShaderMaterial;
  private readonly waterMaterial: THREE.ShaderMaterial;
  private readonly blockInteraction: BlockInteraction;
  private readonly hud: HUD;
  private readonly particles: ParticleSystem;
  private readonly inventory: InventorySystem;
  private readonly inventoryUI: InventoryUI;
  private readonly pauseMenu: PauseMenu;
  private readonly droppedItems: DroppedItemManager;
  private readonly chestManager: ChestManager;
  private readonly atlas: TextureAtlas;
  private readonly shadowSystem: ShadowSystem;
  private readonly torchLightManager: TorchLightManager;
  private readonly heldItemRenderer: HeldItemRenderer;
  private readonly swimmingArms: SwimmingArms;
  private readonly mobManager: MobManager;
  private readonly combatSystem: CombatSystem;
  private readonly physics: Physics;
  private readonly mobAmbientLight: THREE.AmbientLight;
  private readonly mobDirLight: THREE.DirectionalLight;

  // New systems
  private readonly weatherSystem: WeatherSystem;
  private readonly deathScreen: DeathScreen;
  private readonly achievements: AchievementManager;
  private readonly commandSystem: CommandSystem;
  private readonly soundEngine: SoundEngine;
  private readonly music: ProceduralMusic;
  private readonly xpSystem: XPSystem;
  private readonly minimap: Minimap;
  private readonly optionsMenu: OptionsMenu;
  private readonly creativeMenu: CreativeMenu;

  // Spawn point
  /** `?lite` in the URL: render without post-processing / shadows (debugging, weak GPUs) */
  private readonly lite = new URLSearchParams(window.location.search).has('lite');
  private dimensions!: DimensionController;
  private playerAvatar!: PlayerAvatar;
  private defaultFogNear: number = 175;
  private defaultFogFar: number = 400;
  private readonly netherMinLight = new THREE.Vector3(0.26, 0.11, 0.09);
  private readonly endMinLight = new THREE.Vector3(0.20, 0.16, 0.21);
  private readonly overworldMinLight = new THREE.Vector3(0.05, 0.05, 0.07);
  private spawnX: number = 0;
  private spawnY: number = 80;
  private spawnZ: number = 0;

  private lastTime: number = 0;
  private readonly fixedDt: number = 1 / 60;
  private accumulator: number = 0;
  private frameCount: number = 0;
  private fpsTime: number = 0;
  private fps: number = 0;
  private running: boolean = false;
  private gameState: GameState = 'start';
  private openChestPos: { x: number; y: number; z: number } | null = null;

  // Reusable vectors to avoid GC pressure in game loop
  private readonly _camDir = new THREE.Vector3();
  private achievementTimer: number = 0;
  private menuTime: number = 0;

  constructor() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    document.body.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = null;

    // Camera
    this.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR_PLANE, FAR_PLANE);

    // Input
    this.input = new InputManager(this.renderer.domElement);

    // Sky
    this.sky = new Sky(this.scene);

    // Texture Atlas & Materials
    this.atlas = new TextureAtlas();
    this.terrainMaterial = createTerrainMaterial(this.atlas);
    this.waterMaterial = createWaterMaterial();

    // Chest manager
    this.chestManager = new ChestManager();

    // World
    this.world = new World(this.scene, this.terrainMaterial, this.waterMaterial, this.atlas, this.chestManager);

    // Physics & Player
    this.physics = new Physics(this.world);
    this.player = new Player(this.camera, this.input, this.physics);
    this.player.setWorld(this.world);

    // Scene lights for entity rendering (MeshLambertMaterial needs these)
    this.mobAmbientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.mobAmbientLight);
    this.mobDirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.mobDirLight.position.set(50, 80, 30);
    this.scene.add(this.mobDirLight);

    // Mob system
    this.mobManager = new MobManager(this.scene, this.physics, this.world);
    this.combatSystem = new CombatSystem(this.mobManager, this.player, this.camera);

    // Shadow system
    this.shadowSystem = new ShadowSystem(this.atlas);

    // Torch light manager
    this.torchLightManager = new TorchLightManager(this.scene);

    // Held item renderer (first-person hand view)
    this.heldItemRenderer = new HeldItemRenderer(this.camera, this.scene, this.atlas);

    // Swimming arms renderer (first-person swimming animation)
    this.swimmingArms = new SwimmingArms(this.camera, this.scene);

    // Post processing
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);

    // Inventory system
    this.inventory = new InventorySystem();

    // Give some starting items (torch first so it's in slot 0 = selected)
    this.inventory.addItem(ItemType.TORCH, 16);
    this.inventory.addItem(ItemType.WOOD, 16);
    this.inventory.addItem(ItemType.STONE, 16);
    this.inventory.addItem(ItemType.DIRT, 32);
    this.inventory.addItem(ItemType.PLANKS, 8);

    // Block interaction
    this.blockInteraction = new BlockInteraction(this.world, this.player, this.scene, this.inventory);

    // HUD
    this.hud = new HUD(this.atlas, this.inventory);

    // Inventory UI
    this.inventoryUI = new InventoryUI(this.inventory, this.atlas, this.hud);
    this.creativeMenu = new CreativeMenu(this.inventory, this.hud);

    // Pause menu
    this.pauseMenu = new PauseMenu();
    this.pauseMenu.onResume = () => {
      this.input.requestPointerLock();
    };
    this.pauseMenu.onTeleportToStructure = (type: StructureTypeName) => {
      this.teleportToStructure(type);
    };

    // Options menu
    this.optionsMenu = new OptionsMenu();
    this.optionsMenu.setOnSettingsChange((s: GameSettings) => this.applySettings(s));
    this.optionsMenu.onClose = () => {
      // Return to pause menu when options closed
    };
    this.pauseMenu.onOpenOptions = () => {
      this.pauseMenu.hide();
      this.optionsMenu.show();
      this.optionsMenu.onClose = () => {
        this.pauseMenu.show();
      };
    };

    // Also wire main menu options button
    const menuOptionsBtn = document.getElementById('btn-menu-options');
    if (menuOptionsBtn) {
      menuOptionsBtn.addEventListener('click', () => {
        this.optionsMenu.show();
        this.optionsMenu.onClose = () => {
          // Back to main menu
        };
      });
    }

    // Dropped items
    this.droppedItems = new DroppedItemManager(this.scene, this.world, this.atlas);

    // Connect block breaking to drop spawning + torch/chest tracking
    this.blockInteraction.onBlockBreak = (event) => {
      if (event.blockType === BlockType.TORCH) {
        this.torchLightManager.removeTorch(event.x, event.y, event.z);
      }
      if (event.blockType === BlockType.CHEST) {
        const chestItems = this.chestManager.removeChest(event.x, event.y, event.z);
        if (chestItems) {
          for (const stack of chestItems) {
            if (stack) {
              this.droppedItems.spawnFromBlock(event.x, event.y, event.z, stack.itemType as number);
            }
          }
        }
      }
      // Breaking a portal frame closes the portal
      if (event.blockType === BlockType.OBSIDIAN || event.blockType === BlockType.NETHER_PORTAL) {
        this.dimensions.collapsePortal(event.x, event.y, event.z);
      }
      // Gravel sometimes drops flint
      if (event.blockType === BlockType.GRAVEL && Math.random() < 0.25) {
        this.droppedItems.spawnItem(event.x, event.y, event.z, ItemType.FLINT as number, 1);
        this.player.blocksMined++;
        return;
      }
      // TNT explosion
      if (event.blockType === BlockType.TNT) {
        this.explodeTNT(event.x, event.y, event.z);
        return;
      }
      // Ore drops: drop raw material instead of ore block
      const oreDrop = this.getOreDrop(event.blockType);
      if (oreDrop !== null) {
        this.droppedItems.spawnFromBlock(event.x, event.y, event.z, oreDrop);
        this.xpSystem.addXP(this.getOreXP(event.blockType));
        this.soundEngine.play('xp_pickup', 0.3);
      } else {
        this.droppedItems.spawnFromBlock(event.x, event.y, event.z, event.blockType);
      }
      // Leaves can drop apples
      if (event.blockType === BlockType.LEAVES && Math.random() < 0.02) {
        this.droppedItems.spawnFromBlock(event.x, event.y, event.z, ItemType.APPLE as number);
      }
      this.player.blocksMined++;
      this.soundEngine.play('block_break');
    };
    this.blockInteraction.onBlockPlace = (x, y, z, blockType) => {
      if (blockType === BlockType.TORCH) {
        this.torchLightManager.addTorch(x, y, z);
      }
      if (blockType === BlockType.CHEST) {
        this.chestManager.registerChest(x, y, z);
      }
      this.player.blocksPlaced++;
      this.soundEngine.play('block_place');
    };

    // Particles
    this.particles = new ParticleSystem(this.scene);

    // New systems
    this.weatherSystem = new WeatherSystem(this.scene);
    this.deathScreen = new DeathScreen();
    this.achievements = new AchievementManager();
    this.commandSystem = new CommandSystem();
    this.soundEngine = new SoundEngine();
    this.music = new ProceduralMusic();
    this.xpSystem = new XPSystem();
    this.minimap = new Minimap();

    // Third-person avatar + camera feel
    this.playerAvatar = new PlayerAvatar();
    this.scene.add(this.playerAvatar.group);
    this.player.avatar = this.playerAvatar;
    this.player.setBaseFov(this.camera.fov);
    this.defaultFogNear = (this.terrainMaterial as THREE.ShaderMaterial).uniforms.uFogNear.value;
    this.defaultFogFar = (this.terrainMaterial as THREE.ShaderMaterial).uniforms.uFogFar.value;

    // Dimensions: nether / end portals, dragon fight, explosions
    this.dimensions = new DimensionController({
      world: this.world, player: this.player, mobManager: this.mobManager, sky: this.sky,
      scene: this.scene, torchLights: this.torchLightManager, sound: this.soundEngine,
      chat: this.commandSystem, xp: this.xpSystem, inventory: this.inventory,
      droppedItems: this.droppedItems,
      getSpawn: () => ({ x: this.spawnX, y: this.spawnY, z: this.spawnZ }),
    });
    this.dimensions.onDimensionChanged = (dim) => {
      if (dim !== Dimension.OVERWORLD) this.weatherSystem.setWeather('CLEAR' as any);
      this.player.voidY = -12;
    };
    // The weapon in hand decides the damage dealt to mobs
    this.combatSystem.damageProvider = () => {
      const st = this.inventory.hotbar[this.hud.getSelectedSlot()];
      const def = st ? ITEM_DEFINITIONS[st.itemType] : undefined;
      return def && def.attackDamage ? def.attackDamage : 1;
    };
    // F5 would reload the page: use it for the camera instead
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F5' && this.gameState === 'playing') {
        e.preventDefault();
        if (!e.repeat) this.player.cycleCameraMode();
      }
    });

    // Apply saved settings on startup (after all systems are initialized)
    this.applySettings(this.optionsMenu.getSettings());

    // Death screen callbacks
    this.deathScreen.onRespawn = () => {
      this.dimensions.respawnInOverworld();
      this.player.respawn(this.spawnX, this.spawnY, this.spawnZ);
      this.deathScreen.hide();
      this.gameState = 'playing';
      this.input.requestPointerLock();
    };
    this.deathScreen.onTitleScreen = () => {
      window.location.reload();
    };

    // Command system callback
    this.commandSystem.onCommand = (cmd: string, args: string[]) => {
      this.executeCommand(cmd, args);
    };

    // Initial world load
    this.world.forceLoadAll(0, 0);

    // Find spawn point: dry land that is not a tree top or the sea
    let spawnX = 0, spawnZ = 0, spawnY = 80;
    let foundLand = false;
    const goodGround = (b: number): boolean =>
      b === BlockType.GRASS || b === BlockType.SAND || b === BlockType.SNOW || b === BlockType.DIRT ||
      b === BlockType.PODZOL || b === BlockType.RED_SAND || b === BlockType.STONE;
    for (let radius = 0; radius < 96 && !foundLand; radius += 2) {
      for (let dx = -radius; dx <= radius && !foundLand; dx += 2) {
        for (let dz = -radius; dz <= radius && !foundLand; dz += 2) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          for (let y = 120; y > 35; y--) {
            const b = this.world.getBlock(dx, y, dz);
            if (b === BlockType.AIR || b === BlockType.TALL_GRASS || b === BlockType.FERN ||
                b === BlockType.FLOWER_RED || b === BlockType.FLOWER_YELLOW || b === BlockType.DEAD_BUSH) continue;
            if (goodGround(b) && this.world.getBlock(dx, y + 1, dz) === BlockType.AIR && this.world.getBlock(dx, y + 2, dz) === BlockType.AIR) {
              spawnX = dx; spawnZ = dz; spawnY = y + 1; foundLand = true;
            }
            break;
          }
        }
      }
    }
    if (!foundLand) {
      for (let y = 120; y > 0; y--) {
        if (this.world.isSolid(0, y, 0)) { spawnY = y + 1; break; }
      }
    }
    this.spawnX = spawnX + 0.5;
    this.spawnY = spawnY;
    this.spawnZ = spawnZ + 0.5;
    this.player.x = this.spawnX;
    this.player.y = this.spawnY;
    this.player.z = this.spawnZ;

    // Display seed in menu
    const seedEl = document.getElementById('seed-display');
    if (seedEl) seedEl.textContent = `Seed: ${worldSeed}`;
    const footerSeedEl = document.getElementById('footer-seed');
    if (footerSeedEl) footerSeedEl.textContent = String(worldSeed);

    // Set random splash text
    this.initSplashText();

    // Apply blur on canvas for menu panorama
    this.renderer.domElement.style.filter = 'blur(6px) brightness(0.75)';
    this.renderer.domElement.style.transition = 'filter 0.5s ease';

    // Events
    window.addEventListener('resize', this.onResize.bind(this));
    this.setupStartScreen();

    // Start render loop immediately for panorama background
    this.running = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private setupStartScreen(): void {
    const startScreen = document.getElementById('start-screen')!;
    const btnPlay = document.getElementById('btn-play')!;
    const btnQuit = document.getElementById('btn-menu-quit')!;

    // Hide HUD and minimap while on the menu
    const uiOverlay = document.getElementById('ui-overlay');
    if (uiOverlay) uiOverlay.style.display = 'none';

    const startGame = (): void => {
      startScreen.style.opacity = '0';
      startScreen.style.transition = 'opacity 0.4s ease';
      this.renderer.domElement.style.filter = 'none';
      // Show HUD and minimap when game starts
      if (uiOverlay) uiOverlay.style.display = 'block';
      setTimeout(() => {
        startScreen.style.display = 'none';
      }, 400);
      this.gameState = 'playing';
      this.input.requestPointerLock();
    };

    // --- Écran « Nouvelle partie » : mode, qualité, distance, musique ---
    const TIPS = [
      'Double-appuie sur Espace pour voler en mode créatif.',
      'Appuie sur E pour ouvrir l\u2019inventaire (tous les blocs en créatif).',
      'F5 change de vue : première, troisième personne arrière ou avant.',
      'Le mode « Performance » est idéal pour les PC modestes.',
      'La commande /gamemode creative ou survival change de mode à tout moment.',
    ];
    const modeScreen = document.getElementById('mode-screen')!;
    const loading = document.getElementById('loading-screen')!;
    const msDist = document.getElementById('ms-dist') as HTMLInputElement;
    const msDistVal = document.getElementById('ms-dist-val')!;
    const msQuality = document.getElementById('ms-quality') as HTMLSelectElement;
    const cur = this.optionsMenu.getSettings();
    msQuality.value = cur.quality;
    msDist.value = String(cur.renderDistance);
    msDistVal.textContent = msDist.value;
    msDist.addEventListener('input', () => { msDistVal.textContent = msDist.value; });
    let creative = false;
    modeScreen.querySelectorAll<HTMLElement>('.ms-mode').forEach((btn) => btn.addEventListener('click', () => {
      modeScreen.querySelectorAll('.ms-mode').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      creative = btn.dataset.mode === 'creative';
    }));
    btnPlay.addEventListener('click', () => { modeScreen.style.display = 'flex'; });
    document.getElementById('ms-back')!.addEventListener('click', () => { modeScreen.style.display = 'none'; });
    document.getElementById('ms-go')!.addEventListener('click', () => {
      modeScreen.style.display = 'none';
      const musicOn = (document.getElementById('ms-music') as HTMLInputElement).checked;
      this.optionsMenu.applyQuality(msQuality.value as QualityName);
      this.optionsMenu.update({ renderDistance: Number(msDist.value), musicVolume: musicOn ? 0.5 : 0 });
      loading.style.display = 'flex';
      document.getElementById('ld-tip')!.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
      const fill = document.getElementById('ld-fill')!;
      fill.style.width = '20%';
      setTimeout(() => {
        this.world.forceLoadAll(this.player.x, this.player.z);
        fill.style.width = '100%';
        setTimeout(() => {
          loading.style.display = 'none';
          this.setGameMode(creative);
          if (musicOn) this.music.start();
          startGame();
        }, 700);
      }, 120);
    });

    btnQuit.addEventListener('click', () => {
      window.close();
      window.location.href = 'about:blank';
    });

    this.input.setPointerLockChangeCallback(() => {
      if (!this.input.isPointerLocked) {
        if (this.gameState === 'playing') {
          this.gameState = 'paused';
          this.pauseMenu.show();
        }
      } else {
        if (this.gameState === 'paused') {
          this.gameState = 'playing';
          this.pauseMenu.hide();
        }
      }
    });
  }

  private initSplashText(): void {
    const splashes = [
      'Made by AI!',
      'Powered by Claude!',
      '100% Voxels!',
      'Now with mobs!',
      'Zero external assets!',
      'Built with Three.js!',
      'TypeScript powered!',
      'Infinite worlds!',
      'Craft all the things!',
      'Day/night cycle!',
      'AI generated code!',
      'No images used!',
      'Pure procedural!',
      'Shadow mapping!',
      'Explore the depths!',
      'Also try Minecraft!',
      'Claude was here!',
      'Voxel by voxel!',
      'Web Edition!',
      'Try /fly!',
    ];
    const el = document.getElementById('splash-text');
    if (el) {
      el.textContent = splashes[Math.floor(Math.random() * splashes.length)];
    }
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));

    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const time = now / 1000;

    this.adaptQuality(dt);

    // FPS counter
    this.frameCount++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTime);
      this.frameCount = 0;
      this.fpsTime = 0;
    }

    // Menu panorama mode: camera orbits around spawn, render scene, skip gameplay
    if (this.gameState === 'start') {
      this.menuTime += dt;
      const orbitSpeed = 0.05;
      const angle = this.menuTime * orbitSpeed;
      const orbitRadius = 30;
      const camX = this.spawnX + Math.cos(angle) * orbitRadius;
      const camZ = this.spawnZ + Math.sin(angle) * orbitRadius;
      const camY = this.spawnY + 25;
      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(this.spawnX, this.spawnY + 5, this.spawnZ);

      this.sky.update(dt, camX, camZ);
      this.world.update(camX, camZ);

      // Update material uniforms for panorama rendering
      updateMaterialUniforms(
        this.terrainMaterial,
        this.sky.sunDirection,
        this.sky.sunColor,
        this.sky.ambientColor,
        this.sky.fogColor,
        time,
      );
      updateWaterUniforms(
        this.waterMaterial,
        this.sky.sunDirection,
        this.sky.sunColor,
        this.sky.skyColorTop,
        this.sky.fogColor,
        time,
      );

      this.postProcessing.updateSunScreenPos(this.camera, this.sky.sunDirection);
      this.postProcessing.setDayFactor(this.sky.getDayFactor());
      if (this.lite) this.renderer.render(this.scene, this.camera); else this.postProcessing.render();
      this.input.resetFrame();
      return;
    }

    // Handle input states
    this.handleGameInput();

    // Fixed timestep physics (only when playing)
    if (this.gameState === 'playing') {
      this.accumulator += dt;
      while (this.accumulator >= this.fixedDt) {
        if (this.input.isPointerLocked) {
          this.player.update(this.fixedDt);
        }
        // Update mobs in fixed timestep
        this.mobManager.update(
          this.fixedDt,
          this.player.x, this.player.y, this.player.z,
          this.sky.getDayFactor(),
        );
        this.accumulator -= this.fixedDt;
      }
    }

    if (this.gameState === 'playing') this.dimensions.update(dt);

    // Check player death
    if (this.gameState === 'playing' && this.player.health <= 0 && !this.player.isDead) {
      this.player.die();
      this.gameState = 'dead';
      document.exitPointerLock();
      this.deathScreen.show({
        mobsKilled: this.player.mobsKilled,
        distanceTraveled: Math.round(this.player.totalDistanceTraveled),
        blocksMined: this.player.blocksMined,
        survivalTime: this.player.survivalTime,
      });
      this.soundEngine.play('death');
    }

    // Weather update (overworld only)
    this.camera.getWorldDirection(this._camDir);
    const dimNow = this.dimensions.current;
    if (dimNow === Dimension.OVERWORLD) this.weatherSystem.update(dt, this.camera.position, this._camDir);

    // Music
    this.music.update(dt, this.sky.getTimeOfDay());

    // Achievements update (throttled to ~1 check/sec to avoid per-frame overhead)
    this.achievements.update(dt);
    this.achievementTimer += dt;
    if (this.achievementTimer >= 1.0) {
      this.achievementTimer = 0;
      this.achievements.checkCondition('distanceTraveled', this.player.totalDistanceTraveled);
      this.achievements.checkCondition('mobKills', this.player.mobsKilled);
      this.achievements.checkCondition('blocksPlaced', this.player.blocksPlaced);
      this.achievements.checkCondition('blocksMined', this.player.blocksMined);
      this.achievements.checkCondition('minY', this.player.y);
    }

    // Command system
    this.commandSystem.update(dt);

    // Death screen
    if (this.gameState === 'dead') {
      this.deathScreen.update(dt);
    }

    // Sky update (always runs for visual continuity)
    this.sky.update(dt, this.player.x, this.player.z);

    // Sync entity lights with sky
    const dayF = this.sky.getDayFactor();
    this.mobAmbientLight.intensity = dimNow === Dimension.NETHER ? 0.75 : dimNow === Dimension.END ? 0.6 : 0.25 + dayF * 0.55;
    this.mobDirLight.intensity = dimNow === Dimension.OVERWORLD ? 0.2 + dayF * 0.8 : 0.35;
    this.mobDirLight.position.set(
      this.sky.sunDirection.x * 80,
      this.sky.sunDirection.y * 80 + 20,
      this.sky.sunDirection.z * 80,
    );
    this.mobDirLight.color.setRGB(
      this.sky.sunColor.x,
      this.sky.sunColor.y,
      this.sky.sunColor.z,
    );

    // World chunk loading
    this.world.update(this.player.x, this.player.z);

    // Culling par la vision : on masque ce qui n'est pas regardé
    this.camera.updateMatrixWorld();
    this.world.updateVisibility(this.camera);

    // Shadow map rendering
    if (!this.lite) this.shadowSystem.render(
      this.renderer,
      this.scene,
      this.camera,
      this.sky.sunDirection,
      this.sky.getDayFactor(),
    );

    // Biome-based fog tinting
    const biomeFog = this.sky.fogColor.clone();
    const inOverworld = dimNow === Dimension.OVERWORLD;
    if (inOverworld && this.world.biomeSystem) {
      const biome = this.world.biomeSystem.getBiome(Math.floor(this.player.x), Math.floor(this.player.z));
      const bc = this.world.biomeSystem.getConfig(biome);
      biomeFog.lerp(new THREE.Vector3(bc.fogColor[0], bc.fogColor[1], bc.fogColor[2]), 0.3);
    }

    // Terrain material uniforms (fog and minimum light depend on the dimension)
    const fogNear = dimNow === Dimension.NETHER ? 8 : dimNow === Dimension.END ? 60 : this.defaultFogNear;
    const fogFar = dimNow === Dimension.NETHER ? 78 : dimNow === Dimension.END ? 170 : this.defaultFogFar;
    const minLight = dimNow === Dimension.NETHER ? this.netherMinLight : dimNow === Dimension.END ? this.endMinLight : this.overworldMinLight;
    updateMaterialUniforms(
      this.terrainMaterial,
      this.sky.sunDirection,
      this.sky.sunColor,
      this.sky.ambientColor,
      biomeFog,
      time,
      fogNear,
      fogFar,
      minLight,
    );
    updateShadowUniforms(
      this.terrainMaterial,
      this.shadowSystem.shadowMaps,
      this.shadowSystem.shadowMatrices,
      this.sky.getDayFactor(),
    );

    // Water material uniforms
    updateWaterUniforms(
      this.waterMaterial,
      this.sky.sunDirection,
      this.sky.sunColor,
      this.sky.skyColorTop,
      biomeFog,
      time,
    );
    updateWaterShadowUniforms(
      this.waterMaterial,
      this.shadowSystem.shadowMaps[0],
      this.shadowSystem.shadowMatrices[0],
      this.sky.getDayFactor(),
    );

    // Torch lights: detect held torch + update lights + flame particles
    const selectedSlot = this.hud.getSelectedSlot();
    const heldStack = this.inventory.hotbar[selectedSlot];
    this.torchLightManager.setHeldTorch(
      heldStack !== null && heldStack !== undefined && heldStack.itemType === ItemType.TORCH,
    );
    this.torchLightManager.update(dt, this.camera, time);
    this.torchLightManager.updateMaterialUniforms(this.terrainMaterial);
    this.torchLightManager.updateMaterialUniforms(this.waterMaterial);

    // Held item in hand (first-person view) — hidden when swimming
    const heldItemType = heldStack ? heldStack.itemType : -1;
    const isWalking = this.input.isPointerLocked && (
      this.input.isKeyDown('KeyW') || this.input.isKeyDown('KeyS') ||
      this.input.isKeyDown('KeyA') || this.input.isKeyDown('KeyD')
    );
    if (this.player.isSwimming || this.player.isInWater || this.player.cameraMode !== 0) {
      this.heldItemRenderer.update(-1, dt, false); // Hide held item while swimming / third person
    } else {
      this.heldItemRenderer.update(heldItemType, dt, isWalking);
    }

    // Swimming arms (only visible in water)
    this.swimmingArms.update(
      dt,
      this.player.isSwimming,
      this.player.isInWater,
      this.player.swimStrokePhase,
    );

    // Particles
    this.particles.update(dt, this.player.x, this.player.y, this.player.z, 1.0);

    // Combat system update (before block interaction to take priority)
    if (this.gameState === 'playing' && this.input.isPointerLocked) {
      this.combatSystem.update(dt, this.input.leftClick);
    }

    // Block interaction (only when playing, skip if combat hit a mob)
    if (this.gameState === 'playing' && this.input.isPointerLocked) {
      const mobAimed = this.combatSystem.isAimingAtMob();
      this.blockInteraction.update(
        mobAimed ? false : this.input.leftClickHeld,
        this.input.rightClick,
        this.hud.getSelectedSlot(),
        dt,
      );
    }

    // Dropped items
    this.droppedItems.update(dt, this.player, this.inventory);

    // HUD
    this.hud.setAimingAtMob(this.combatSystem.isAimingAtMob());
    this.hud.update(this.fps, this.player, this.sky, dt);
    if (this.gameState === 'playing') {
      this.hud.handleInput(this.input);
    }

    // Inventory UI
    if (this.gameState === 'inventory') {
      this.inventoryUI.update();
    }

    // Minimap (throttled internally, passes dt for timer)
    if (this.gameState === 'playing') {
      const aliveMobs = this.mobManager.getAliveMobs();
      const minimapMobs = [];
      for (let i = 0; i < aliveMobs.length; i++) {
        const m = aliveMobs[i];
        minimapMobs.push({ x: m.x, z: m.z, hostile: !!m.definition.hostile });
      }
      this.minimap.update(
        this.player.x, this.player.z, this.player.yaw,
        (x: number, z: number) => {
          for (let y = 90; y > 0; y--) {
            const block = this.world.getBlock(x, y, z);
            if (block !== 0) return block;
          }
          return 0;
        },
        minimapMobs,
        dt,
      );
    }

    // Post-processing
    this.postProcessing.updateSunScreenPos(this.camera, this.sky.sunDirection);
    this.postProcessing.setDayFactor(this.sky.getDayFactor());
    this.postProcessing.setUnderwaterFactor(this.player.underwaterFactor);
    this.postProcessing.setTime(time);

    // Render
    if (this.lite) this.renderer.render(this.scene, this.camera); else this.postProcessing.render();

    // Reset per-frame input
    this.input.resetFrame();
  }

  private handleGameInput(): void {
    // Command system intercept
    if (this.commandSystem.isOpen()) {
      return;
    }

    // T or / to open chat
    if (this.gameState === 'playing' && (this.input.wasKeyPressed('KeyT') || this.input.wasKeyPressed('Slash'))) {
      this.commandSystem.open();
      return;
    }

    // M for minimap toggle
    if (this.input.wasKeyPressed('KeyM') && this.gameState === 'playing') {
      this.minimap.toggle();
    }

    // E key: toggle inventory
    if (this.input.wasKeyPressed('KeyE') && !this.creativeMenu.isTyping()) {
      if (this.gameState === 'playing') {
        this.openInventory(false);
      } else if (this.gameState === 'inventory') {
        this.closeInventory();
      }
    }

    // Escape key: close inventory or handled by pointer lock
    if (this.input.wasKeyPressed('Escape')) {
      if (this.gameState === 'inventory') {
        this.closeInventory();
      }
    }

    // Right-click on interactive blocks, mobs, or eat food
    if (this.gameState === 'playing' && this.input.rightClick && this.input.isPointerLocked) {
      // Try to mount a horse first
      if (!this.player.isRiding) {
        const horse = this.mobManager.findNearestRideable(
          this.player.x, this.player.y + 0.8, this.player.z, 3.5,
        );
        if (horse) {
          this.player.mountHorse(horse);
          this.achievements.checkCondition('horseRidden', true);
          return;
        }
      }

      const result = this.blockInteraction.getLastResult();
      if (result && result.hit) {
        if (result.blockType === BlockType.CRAFTING_TABLE) {
          this.openInventory(true);
          return;
        }
        if (result.blockType === BlockType.CHEST) {
          this.openChestAt(result.blockX, result.blockY, result.blockZ);
          return;
        }
        if (result.blockType === BlockType.FURNACE) {
          this.openInventory(false);
          return;
        }
      }

      // Flint & steel (lights portals / fires), ender eye (end portal frames)
      {
        const slot = this.hud.getSelectedSlot();
        const held = this.inventory.hotbar[slot];
        if (held && result && result.hit) {
          if (held.itemType === ItemType.FLINT_AND_STEEL) {
            const lit = this.dimensions.tryLightPortal(result.placeX, result.placeY, result.placeZ);
            if (!lit && this.world.getBlock(result.placeX, result.placeY, result.placeZ) === BlockType.AIR &&
                result.blockType !== BlockType.WATER && result.blockType !== BlockType.LAVA) {
              this.world.setBlock(result.placeX, result.placeY, result.placeZ, BlockType.FIRE);
              this.soundEngine.play('block_place', 0.4);
            }
            return;
          }
          if (held.itemType === ItemType.ENDER_EYE && result.blockType === BlockType.END_PORTAL_FRAME) {
            if (this.dimensions.tryInsertEye(result.blockX, result.blockY, result.blockZ)) {
              held.count -= 1;
              if (held.count <= 0) this.inventory.hotbar[slot] = null;
              return;
            }
          }
        }
      }

      // Try eating held food
      const selectedSlot2 = this.hud.getSelectedSlot();
      const heldStack2 = this.inventory.hotbar[selectedSlot2];
      if (heldStack2) {
        const def = ITEM_DEFINITIONS[heldStack2.itemType];
        if (def && def.foodHunger && this.player.hunger < this.player.maxHunger) {
          this.player.eatFood(def.foodHunger, def.foodSaturation ?? 0);
          heldStack2.count -= 1;
          if (heldStack2.count <= 0) {
            this.inventory.hotbar[selectedSlot2] = null;
          }
          this.soundEngine.play('eat');
          this.achievements.checkCondition('foodCooked', 1);
        }
      }
    }
  }

  private setGameMode(creative: boolean): void {
    this.player.isCreative = creative;
    if (creative) this.player.health = 20; else this.player.isFlying = false;
    this.commandSystem.addMessage(
      creative ? 'Mode créatif : double-Espace pour voler · E pour tous les blocs' : 'Mode survie',
      '#55ff55',
    );
  }

  private openInventory(craftingTable: boolean): void {
    this.gameState = 'inventory';
    document.exitPointerLock();
    if (this.player.isCreative && !craftingTable) { this.creativeMenu.open(); return; }
    this.inventoryUI.open(craftingTable);
  }

  private openChestAt(x: number, y: number, z: number): void {
    if (!this.chestManager.hasChest(x, y, z)) {
      this.chestManager.registerChest(x, y, z);
    }
    const slots = this.chestManager.getChest(x, y, z);
    if (!slots) return;
    this.openChestPos = { x, y, z };
    this.gameState = 'inventory';
    document.exitPointerLock();
    this.inventoryUI.openChest(slots);
  }

  private closeInventory(): void {
    if (this.creativeMenu.isOpen) {
      this.creativeMenu.close();
      this.gameState = 'playing';
      this.input.requestPointerLock();
      return;
    }
    if (this.inventoryUI.getIsChest()) {
      this.inventory.closeChest();
    }
    this.inventoryUI.close();
    this.openChestPos = null;
    this.gameState = 'playing';
    this.input.requestPointerLock();
  }

  private teleportToStructure(type: StructureTypeName): void {
    const loc = this.world.findNearestStructure(this.player.x, this.player.z, type);
    if (!loc) {
      console.log(`%cNo ${type} found nearby`, 'color: #f44336');
      return;
    }
    // Force-load chunks around target first so terrain exists
    this.world.forceLoadAll(loc.wx, loc.wz);
    // Teleport player high above the structure so they fall down onto it
    this.player.x = loc.wx + 0.5;
    this.player.y = loc.wy + 40;
    this.player.z = loc.wz + 0.5;
    console.log(`%cTeleported to ${type} at (${loc.wx}, ${loc.wy}, ${loc.wz}) — distance: ${Math.round(loc.dist)} blocks`, 'color: #4CAF50; font-size: 12px');
    // Resume game
    this.pauseMenu.hide();
    this.gameState = 'playing';
    this.input.requestPointerLock();
  }

  private explodeTNT(x: number, y: number, z: number): void {
    const radius = 4;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dy * dy + dz * dz <= radius * radius) {
            const bx = x + dx, by = y + dy, bz = z + dz;
            const block = this.world.getBlock(bx, by, bz);
            if (block !== BlockType.AIR && block !== BlockType.BEDROCK && block !== BlockType.WATER) {
              this.world.setBlock(bx, by, bz, BlockType.AIR);
            }
          }
        }
      }
    }
    this.soundEngine.play('explosion');
    this.achievements.checkCondition('tntExploded', true);
    // Damage player if nearby
    const dist = Math.sqrt((this.player.x - x) ** 2 + (this.player.y - y) ** 2 + (this.player.z - z) ** 2);
    if (dist < radius * 2 && !this.player.isCreative) {
      const damage = Math.max(1, Math.floor((radius * 2 - dist) * 3));
      this.player.takeDamage(damage, this.player.x - x, this.player.z - z);
    }
  }

  private getOreDrop(blockType: number): number | null {
    switch (blockType) {
      case BlockType.COAL_ORE: return ItemType.COAL;
      case BlockType.IRON_ORE: return ItemType.IRON_RAW;
      case BlockType.GOLD_ORE: return ItemType.GOLD_RAW;
      case BlockType.DIAMOND_ORE: return ItemType.DIAMOND;
      case BlockType.EMERALD_ORE: return ItemType.EMERALD;
      case BlockType.NETHER_QUARTZ_ORE: return ItemType.NETHER_QUARTZ;
      default: return null;
    }
  }

  private getOreXP(blockType: number): number {
    switch (blockType) {
      case BlockType.COAL_ORE: return 1;
      case BlockType.IRON_ORE: return 2;
      case BlockType.GOLD_ORE: return 3;
      case BlockType.DIAMOND_ORE: return 7;
      case BlockType.EMERALD_ORE: return 5;
      case BlockType.NETHER_QUARTZ_ORE: return 3;
      default: return 0;
    }
  }

  private executeCommand(cmd: string, args: string[]): void {
    switch (cmd) {
      case 'tp':
        if (args.length >= 3) {
          const tx = parseFloat(args[0]);
          const ty = parseFloat(args[1]);
          const tz = parseFloat(args[2]);
          if (!isNaN(tx) && !isNaN(ty) && !isNaN(tz)) {
            this.player.x = tx;
            this.player.y = ty;
            this.player.z = tz;
            this.commandSystem.addMessage(`Teleported to ${tx}, ${ty}, ${tz}`, '#55ff55');
          }
        }
        break;
      case 'time':
        if (args[0] === 'set') {
          // Sun height = sin(2*pi*t): sunrise 0, noon 0.25, sunset 0.5, midnight 0.75
          const timeMap: Record<string, number> = { day: 0.1, noon: 0.25, sunset: 0.46, night: 0.62, midnight: 0.75 };
          const t = timeMap[args[1]];
          if (t !== undefined) {
            this.sky.setTimeOfDay(t);
            this.commandSystem.addMessage(`Time set to ${args[1]}`, '#55ff55');
          }
        }
        break;
      case 'weather':
        if (args[0]) {
          const weatherMap: Record<string, string> = { clear: 'CLEAR', rain: 'RAIN', thunder: 'THUNDER', snow: 'SNOW' };
          const w = weatherMap[args[0]];
          if (w) {
            this.weatherSystem.setWeather(w as any);
            this.commandSystem.addMessage(`Weather set to ${args[0]}`, '#55ff55');
          }
        }
        break;
      case 'gamemode':
        if (args[0] === 'creative' || args[0] === 'c') this.setGameMode(true);
        else if (args[0] === 'survival' || args[0] === 's') this.setGameMode(false);
        break;
      case 'kill':
        this.player.die();
        break;
      case 'dimension': {
        const names: Record<string, Dimension> = { overworld: Dimension.OVERWORLD, nether: Dimension.NETHER, end: Dimension.END };
        const target = names[args[0] ?? ''];
        if (target === undefined) { this.commandSystem.addMessage('Usage: /dimension overworld|nether|end', '#ff5555'); break; }
        if (target === this.dimensions.current) { this.commandSystem.addMessage('Already there', '#ffff55'); break; }
        this.dimensions.travel(target, target === Dimension.OVERWORLD ? 'spawn' : 'portal');
        break;
      }
      case 'camera':
        this.player.cycleCameraMode();
        this.commandSystem.addMessage(['First person', 'Third person (back)', 'Third person (front)'][this.player.cameraMode], '#55ff55');
        break;
      case 'heal':
        this.player.health = this.player.maxHealth;
        this.player.extinguish();
        this.commandSystem.addMessage('Healed', '#55ff55');
        break;
      case 'summon': {
        const key = (args[0] ?? '').toUpperCase();
        if (key === 'ENDER_DRAGON') { this.dimensions.summonDragon(); break; }
        const entry = Object.entries(MobType).find(([k, v]) => k === key && typeof v === 'number');
        if (!entry) { this.commandSystem.addMessage(`Unknown mob: ${args[0] ?? ''}`, '#ff5555'); break; }
        const fx = -Math.sin(this.player.yaw) * 4, fz = -Math.cos(this.player.yaw) * 4;
        this.mobManager.spawnMob(entry[1] as MobType, this.player.x + fx, this.player.y + 1, this.player.z + fz);
        this.commandSystem.addMessage(`Summoned ${args[0]}`, '#55ff55');
        break;
      }
      case 'spawn':
        if (this.dimensions.current !== Dimension.OVERWORLD) {
          this.dimensions.travel(Dimension.OVERWORLD, 'spawn');
          break;
        }
        this.player.x = this.spawnX;
        this.player.y = this.spawnY;
        this.player.z = this.spawnZ;
        this.commandSystem.addMessage('Teleported to spawn', '#55ff55');
        break;
      case 'seed':
        this.commandSystem.addMessage(`Seed: ${worldSeed}`, '#aaaaff');
        break;
      case 'xp':
        if (args[0]) {
          const amt = parseInt(args[0]);
          if (!isNaN(amt)) {
            this.xpSystem.addXP(amt);
            this.commandSystem.addMessage(`Gave ${amt} XP`, '#55ff55');
          }
        }
        break;
      case 'fly':
        this.player.isFlying = !this.player.isFlying;
        this.commandSystem.addMessage(`Flying: ${this.player.isFlying ? 'ON' : 'OFF'}`, '#55ff55');
        break;
      case 'give':
        if (args[0]) {
          const itemName = args[0].toUpperCase().replace(/ /g, '_');
          const count = args[1] ? parseInt(args[1]) : 1;
          const itemEntry = Object.entries(ItemType).find(([k]) => k === itemName);
          if (itemEntry) {
            const itemId = (itemEntry[1] as number);
            this.inventory.addItem(itemId, isNaN(count) ? 1 : count);
            this.commandSystem.addMessage(`Gave ${count}x ${args[0]}`, '#55ff55');
          } else {
            this.commandSystem.addMessage(`Unknown item: ${args[0]}`, '#ff5555');
          }
        }
        break;
      default:
        this.commandSystem.addMessage(`Unknown command: /${cmd}`, '#ff5555');
    }
  }

  private applySettings(s: GameSettings): void {
    // Video
    this.world.renderDistance = s.renderDistance;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.player.setBaseFov(s.fov);
    this.shadowSystem.enabled = s.shadowsEnabled;
    this.autoQuality = s.autoQuality;
    this.setResolutionScale(s.resolutionScale);
    this.postProcessing.setBloomEnabled(s.bloomEnabled);
    this.postProcessing.setSsaoEnabled(s.ssaoEnabled);
    this.postProcessing.setGodRaysEnabled(s.godRaysEnabled);

    // Audio
    this.soundEngine.setMasterVolume(s.masterVolume);
    this.soundEngine.setMusicVolume(s.musicVolume);
    this.music.setVolume(s.masterVolume * s.musicVolume * 0.4);
    this.soundEngine.setSfxVolume(s.sfxVolume);

    // Controls
    this.player.setMouseSensitivity(s.mouseSensitivity);
  }

  private autoQuality = true;
  private lowFpsTime = 0;
  private resScale = 1;

  private setResolutionScale(scale: number): void {
    if (Math.abs(scale - this.resScale) < 0.01) return;
    this.resScale = scale;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * scale);
    this.onResize();
  }

  /** Si le jeu reste sous 28 FPS pendant 3 s, on descend d'un cran de qualité. */
  private adaptQuality(dt: number): void {
    if (!this.autoQuality || this.gameState !== 'playing' || this.fps === 0) { this.lowFpsTime = 0; return; }
    this.lowFpsTime = this.fps < 28 ? this.lowFpsTime + dt : 0;
    if (this.lowFpsTime < 3) return;
    this.lowFpsTime = -4; // laisse le temps de se stabiliser
    const order = ['ultra', 'high', 'medium', 'low'] as const;
    const cur = order.indexOf(this.optionsMenu.getSettings().quality);
    if (cur >= 0 && cur < order.length - 1) {
      this.optionsMenu.applyQuality(order[cur + 1]);
      this.commandSystem.addMessage(`Qualité réduite automatiquement : ${order[cur + 1]}`, '#ffaa00');
    }
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.postProcessing.resize(w, h);
  }
}
