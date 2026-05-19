"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditsService = void 0;
const common_1 = require("@nestjs/common");
let CreditsService = class CreditsService {
    create(createCreditDto) {
        return 'This action adds a new credit';
    }
    findAll() {
        return `This action returns all credits`;
    }
    findOne(id) {
        return `This action returns a #${id} credit`;
    }
    update(id, updateCreditDto) {
        return `This action updates a #${id} credit`;
    }
    remove(id) {
        return `This action removes a #${id} credit`;
    }
};
exports.CreditsService = CreditsService;
exports.CreditsService = CreditsService = __decorate([
    (0, common_1.Injectable)()
], CreditsService);
//# sourceMappingURL=credits.service.js.map