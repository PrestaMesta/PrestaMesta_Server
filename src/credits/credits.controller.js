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
exports.CreditsController = void 0;
const common_1 = require("@nestjs/common");
const credits_service_1 = require("./credits.service");
const create_credit_dto_1 = require("./dto/create-credit.dto");
const update_credit_dto_1 = require("./dto/update-credit.dto");
let CreditsController = class CreditsController {
    creditsService;
    constructor(creditsService) {
        this.creditsService = creditsService;
    }
    create(createCreditDto) {
        return this.creditsService.create(createCreditDto);
    }
    findAll() {
        return this.creditsService.findAll();
    }
    findOne(id) {
        return this.creditsService.findOne(+id);
    }
    update(id, updateCreditDto) {
        return this.creditsService.update(+id, updateCreditDto);
    }
    remove(id) {
        return this.creditsService.remove(+id);
    }
};
exports.CreditsController = CreditsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_credit_dto_1.CreateCreditDto]),
    __metadata("design:returntype", void 0)
], CreditsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CreditsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CreditsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_credit_dto_1.UpdateCreditDto]),
    __metadata("design:returntype", void 0)
], CreditsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CreditsController.prototype, "remove", null);
exports.CreditsController = CreditsController = __decorate([
    (0, common_1.Controller)('credits'),
    __metadata("design:paramtypes", [credits_service_1.CreditsService])
], CreditsController);
//# sourceMappingURL=credits.controller.js.map