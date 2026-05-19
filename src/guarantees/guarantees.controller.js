"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuaranteesController = void 0;
const common_1 = require("@nestjs/common");
const guarantees_service_1 = require("./guarantees.service");
const create_guarantee_dto_1 = require("./dto/create-guarantee.dto");
const update_guarantee_dto_1 = require("./dto/update-guarantee.dto");
let GuaranteesController = class GuaranteesController {
    guaranteesService;
    constructor(guaranteesService) {
        this.guaranteesService = guaranteesService;
    }
    create(createGuaranteeDto) {
        return this.guaranteesService.create(createGuaranteeDto);
    }
    findAll() {
        return this.guaranteesService.findAll();
    }
    findOne(id) {
        return this.guaranteesService.findOne(+id);
    }
    update(id, updateGuaranteeDto) {
        return this.guaranteesService.update(+id, updateGuaranteeDto);
    }
    remove(id) {
        return this.guaranteesService.remove(+id);
    }
};
exports.GuaranteesController = GuaranteesController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_guarantee_dto_1.CreateGuaranteeDto]),
    __metadata("design:returntype", void 0)
], GuaranteesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GuaranteesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GuaranteesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_guarantee_dto_1.UpdateGuaranteeDto]),
    __metadata("design:returntype", void 0)
], GuaranteesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GuaranteesController.prototype, "remove", null);
exports.GuaranteesController = GuaranteesController = __decorate([
    (0, common_1.Controller)('guarantees'),
    __metadata("design:paramtypes", [guarantees_service_1.GuaranteesService])
], GuaranteesController);
//# sourceMappingURL=guarantees.controller.js.map